import os
import re
import json
import asyncio
import hashlib
import html as html_lib
import httpx
from typing import Optional
from models.job_search import JobResult, FilterReason

ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs/us/search"
REMOTIVE_BASE = "https://remotive.com/api/remote-jobs"
SALARY_CEILING_SKIP = 80_000
HOURLY_ANNUAL_THRESHOLD = 100_000

# Hard removes — job is dropped, counted in filter_breakdown
_HARD_FILTERS: list[tuple[str, str]] = [
    (
        "Clearance required",
        r"clearance required|top secret|\bts/sci\b|secret clearance",
    ),
    (
        "Startup signals",
        r"fast[\s-]paced startup|fast[\s-]paced and passionate"
        r"|as we scale\b|founding team|series [ab]\b",
    ),
    (
        "Wrong domain",
        r"\b(mechanical engineer|electrical engineer|robotics|photonics"
        r"|firmware engineer|structural engineer)\b",
    ),
]

# Soft flags — job is kept but shown with a warning badge
_SOFT_FLAGS: list[tuple[str, str]] = [
    ("US citizen required", r"u\.?s\.? citizen"),
    ("30%+ travel", r"30\s*%\s*travel|travel\s*[\w\s]{0,8}30\s*%"),
    ("50%+ travel", r"50\s*%\s*travel|travel\s*[\w\s]{0,8}50\s*%"),
]


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").strip()


def _match_hard_filter(text: str) -> Optional[str]:
    lower = text.lower()
    for label, pat in _HARD_FILTERS:
        if re.search(pat, lower):
            return label
    return None


def _check_low_hourly(text: str) -> Optional[str]:
    lower = text.lower()
    if not re.search(r'/h(r|our)\b|\bper hour\b|\bhourly\b', lower):
        return None
    m = (
        re.search(r'\$?([\d,]+(?:\.\d+)?)\s*/\s*h(?:r|our)\b', lower)
        or re.search(r'\$?([\d,]+(?:\.\d+)?)\s+per\s+hour\b', lower)
        or re.search(r'hourly[^\d$]{0,20}\$?([\d,]+(?:\.\d+)?)', lower)
    )
    if m:
        rate = float(m.group(1).replace(',', ''))
        if rate < 1000 and rate * 2080 < HOURLY_ANNUAL_THRESHOLD:
            return "Low hourly rate"
    return None


def _check_short_contract(text: str) -> Optional[str]:
    lower = text.lower()
    if not re.search(r'\b(contract|temp|temporary|contractor)\b', lower):
        return None
    if re.search(r'\b([1-9]|1[01])[- ](month|mo)\b', lower):
        return "Short-term contract"
    return None


def _detect_soft_flags(text: str) -> list[str]:
    lower = text.lower()
    return [label for label, pat in _SOFT_FLAGS if re.search(pat, lower)]


def _format_salary(lo: Optional[int], hi: Optional[int]) -> str:
    if lo and hi:
        return f"${lo:,} – ${hi:,}"
    if hi:
        return f"Up to ${hi:,}"
    if lo:
        return f"${lo:,}+"
    return "Not listed"


def _dedup_key(title: str, company: str) -> str:
    return re.sub(r"[^a-z0-9]", "", f"{title}{company}".lower())


def _parse_salary_string(s: str) -> tuple[Optional[int], Optional[int]]:
    if not s:
        return None, None
    cleaned = s.replace(",", "")
    nums = []
    for m in re.finditer(r"\$?(\d+(?:\.\d+)?)\s*(k|K)?", cleaned):
        val = float(m.group(1))
        if m.group(2):
            val *= 1000
        elif val < 10_000:
            continue
        if 20_000 <= val <= 500_000:
            nums.append(int(val))
    if len(nums) >= 2:
        return min(nums), max(nums)
    if len(nums) == 1:
        return nums[0], None
    return None, None


_FETCH_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_JD_CLASS_RE = re.compile(
    r"job[-_]?descr|posting[-_]?descr|job[-_]?detail|"
    r"job[-_]?content|job[-_]?body|description[-_]?body|"
    r"job[-_]?posting[-_]?body",
    re.IGNORECASE,
)


def _clean_text(text: str) -> str:
    text = html_lib.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _drop_boilerplate(html: str) -> str:
    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.DOTALL)
    return html


def _extract_jsonld(html: str) -> str:
    for m in re.finditer(
        r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
        html, re.DOTALL | re.IGNORECASE,
    ):
        try:
            data = json.loads(m.group(1))
            if isinstance(data, list):
                data = next((d for d in data if isinstance(d, dict) and d.get("@type") == "JobPosting"), None)
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                desc = data.get("description", "")
                if desc:
                    return _clean_text(_strip_html(str(desc)))
        except Exception:
            continue
    return ""


def _extract_container(html: str) -> str:
    html = _drop_boilerplate(html)
    for m in re.finditer(
        r"<(?:div|section|article|main)\b[^>]+(?:id|class)=[\"']([^\"']*)[\"']",
        html, re.IGNORECASE,
    ):
        if _JD_CLASS_RE.search(m.group(1)):
            snippet = html[m.end(): m.end() + 15_000]
            text = _clean_text(_strip_html(snippet))
            if len(text) > 300:
                return text
    return ""


async def fetch_job_description(url: str) -> tuple[str, bool]:
    """Fetch and extract a job description from a posting URL.

    Returns (text, is_full) — is_full=False means we fell back to
    a truncated or whole-page extract.
    """
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": _FETCH_UA})
            resp.raise_for_status()
            html = resp.text
    except Exception:
        return "", False

    text = _extract_jsonld(html)
    if text and len(text) > 200:
        return text, True

    text = _extract_container(html)
    if text and len(text) > 200:
        return text, True

    # Last resort: strip all tags from whole page
    stripped = _clean_text(_strip_html(_drop_boilerplate(html)))
    return stripped[:8_000], False


async def _search_adzuna(
    client: httpx.AsyncClient,
    title: str,
    location: str,
    salary_floor: int,
) -> list[JobResult]:
    app_id = os.environ.get("ADZUNA_APP_ID", "")
    app_key = os.environ.get("ADZUNA_APP_KEY", "")
    if not app_id or not app_key:
        return []

    params: dict = {
        "app_id": app_id,
        "app_key": app_key,
        "what": title,
        "results_per_page": 15,
        "salary_min": salary_floor,
    }
    if location and "remote" not in location.lower():
        params["where"] = location.split(",")[0].strip()

    try:
        resp = await client.get(f"{ADZUNA_BASE}/1", params=params, timeout=12)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("results", []):
        raw_desc = _strip_html(item.get("description", ""))
        salary_min = int(item.get("salary_min") or 0) or None
        salary_max = int(item.get("salary_max") or 0) or None
        if salary_max and salary_max < SALARY_CEILING_SKIP:
            continue
        job_id = hashlib.md5(f"adzuna:{item.get('id', '')}".encode()).hexdigest()[:12]
        results.append(JobResult(
            id=job_id,
            title=item.get("title", ""),
            company=item.get("company", {}).get("display_name", "Unknown"),
            salary_min=salary_min,
            salary_max=salary_max,
            salary_display=_format_salary(salary_min, salary_max),
            location=item.get("location", {}).get("display_name", ""),
            description=raw_desc,
            url=item.get("redirect_url", ""),
            source="Adzuna",
            flags=[],
        ))
    return results


async def _search_remotive(
    client: httpx.AsyncClient,
    title: str,
) -> list[JobResult]:
    try:
        resp = await client.get(
            REMOTIVE_BASE,
            params={"search": title, "limit": 15},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("jobs", []):
        raw_desc = _strip_html(item.get("description", ""))
        salary_str = item.get("salary", "") or ""
        salary_min, salary_max = _parse_salary_string(salary_str)
        if salary_max and salary_max < SALARY_CEILING_SKIP:
            continue
        job_id = hashlib.md5(f"remotive:{item.get('id', '')}".encode()).hexdigest()[:12]
        results.append(JobResult(
            id=job_id,
            title=item.get("title", ""),
            company=item.get("company_name", "Unknown"),
            salary_min=salary_min,
            salary_max=salary_max,
            salary_display=salary_str if salary_str else "Not listed",
            location=item.get("candidate_required_location", "Remote"),
            description=raw_desc,
            url=item.get("url", ""),
            source="Remotive",
            flags=[],
        ))
    return results


def _apply_filters(
    jobs: list[JobResult],
) -> tuple[list[JobResult], list[FilterReason]]:
    counts: dict[str, int] = {}
    kept: list[JobResult] = []

    for job in jobs:
        full_text = f"{job.title} {job.description} {job.salary_display}"

        reason = (
            _match_hard_filter(full_text)
            or _check_low_hourly(full_text)
            or _check_short_contract(full_text)
        )
        if reason:
            counts[reason] = counts.get(reason, 0) + 1
            continue

        job.flags = _detect_soft_flags(full_text)
        kept.append(job)

    breakdown = [
        FilterReason(label=k, count=v)
        for k, v in sorted(counts.items(), key=lambda x: -x[1])
    ]
    return kept, breakdown


async def search_jobs(
    titles: list[str],
    location: str,
    salary_floor: int,
) -> tuple[list[JobResult], int, list[FilterReason]]:
    async with httpx.AsyncClient() as client:
        tasks = [
            coro
            for title in titles
            for coro in (
                _search_adzuna(client, title, location, salary_floor),
                _search_remotive(client, title),
            )
        ]
        batches = await asyncio.gather(*tasks)

    seen: set[str] = set()
    all_jobs: list[JobResult] = []
    for batch in batches:
        for job in batch:
            key = _dedup_key(job.title, job.company)
            if key not in seen:
                seen.add(key)
                all_jobs.append(job)

    kept, breakdown = _apply_filters(all_jobs)
    return kept, len(all_jobs) - len(kept), breakdown
