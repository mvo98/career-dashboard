import os
import re
import json
from datetime import date, timedelta
from typing import Optional, Any
import httpx

_AT_BASE = "https://api.airtable.com/v0"

# Evaluation fields to create on first save
_EVAL_FIELD_SPECS = [
    ("Action",         "singleLineText", {}),
    ("Skill Fit",      "number",         {"precision": 0}),
    ("Comp Fit",       "number",         {"precision": 0}),
    ("Strategic Fit",  "number",         {"precision": 0}),
    ("Domain Fit",     "number",         {"precision": 0}),
    ("Level Fit",      "number",         {"precision": 0}),
    ("Rationale",      "multilineText",  {}),
    ("Full JD",        "multilineText",  {}),
    ("Notes",          "multilineText",  {}),
    ("Date Evaluated", "date",           {"dateFormat": {"name": "iso"}}),
    ("PostingURL",          "url",            {}),
    ("Source",              "singleLineText", {}),
    ("MaterialsGenerated",  "checkbox",       {"icon": "check", "color": "greenBright"}),
    ("MaterialsDate",       "date",           {"dateFormat": {"name": "iso"}}),
]

_DIM_MAP = {
    "skill_fit":        "Skill Fit",
    "compensation_fit": "Comp Fit",
    "strategic_fit":    "Strategic Fit",
    "domain_fit":       "Domain Fit",
    "level_fit":        "Level Fit",
}

_eval_fields_ensured = False

_STATUS_CANONICAL = {s.lower(): s for s in [
    'Evaluated', 'Applied', 'Responded', 'Scheduled', 'Interviewing',
    'Offer', 'Rejected', 'Passed', 'Saved', 'Explore', 'Skip', 'Dismissed',
]}


def _canonical_status(s: Optional[str]) -> Optional[str]:
    if not s:
        return s
    return _STATUS_CANONICAL.get(s.strip().lower(), s)


def _cfg() -> tuple[str, str, str]:
    return (
        os.environ["AIRTABLE_TOKEN"],
        os.environ["AIRTABLE_BASE_ID"],
        os.environ["AIRTABLE_TABLE_ID"],
    )


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _dedup_key(title: str, company: str) -> str:
    return re.sub(r"[^a-z0-9]", "", f"{title}{company}".lower())


async def _ensure_eval_fields(client: httpx.AsyncClient) -> None:
    global _eval_fields_ensured
    if _eval_fields_ensured:
        return
    token, base, table = _cfg()
    for name, ftype, options in _EVAL_FIELD_SPECS:
        body: dict = {"name": name, "type": ftype}
        if options:
            body["options"] = options
        await client.post(
            f"{_AT_BASE}/meta/bases/{base}/tables/{table}/fields",
            headers=_h(token),
            content=json.dumps(body),
        )
    _eval_fields_ensured = True


async def _fetch_all_records(client: httpx.AsyncClient, field_names: list[str]) -> list[dict]:
    token, base, table = _cfg()
    records: list[dict] = []
    offset: Optional[str] = None
    while True:
        params: list = [("fields[]", f) for f in field_names] + [("pageSize", "100")]
        if offset:
            params.append(("offset", offset))
        resp = await client.get(
            f"{_AT_BASE}/{base}/{table}",
            headers=_h(token),
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
    return records


async def save_evaluation(
    company: str,
    role: str,
    fit_score: int,
    comp: str,
    action: str,
    rationale: str,
    dimensions: dict[str, Any],
    full_jd: str,
    url: str = "",
    source: str = "",
) -> dict:
    token, base, table = _cfg()

    async with httpx.AsyncClient(timeout=20) as client:
        await _ensure_eval_fields(client)

        # Explore/Skip already have their verdict; Apply still needs a pipeline decision
        pipeline_status = action if action in ("Explore", "Skip") else "Evaluated"

        fields: dict[str, Any] = {
            "Fit":            fit_score,
            "Action":         action,
            "Rationale":      rationale,
            "Full JD":        full_jd[:99_000],
            "Date Evaluated": str(date.today()),
            "Status":         pipeline_status,
        }
        if company:
            fields["Company"] = company
        if role:
            fields["Role"] = role
        if comp:
            fields["Comp"] = comp
        if url:
            fields["PostingURL"] = url
        if source:
            fields["Source"] = source
        for dim_key, label in _DIM_MAP.items():
            if dim_key in dimensions:
                fields[label] = dimensions[dim_key]["score"]

        if company and role:
            payload = {
                "records": [{"fields": fields}],
                "performUpsert": {"fieldsToMergeOn": ["Company", "Role"]},
                "typecast": True,
            }
            resp = await client.patch(
                f"{_AT_BASE}/{base}/{table}",
                headers=_h(token),
                content=json.dumps(payload),
            )
        else:
            payload = {"records": [{"fields": fields}], "typecast": True}
            resp = await client.post(
                f"{_AT_BASE}/{base}/{table}",
                headers=_h(token),
                content=json.dumps(payload),
            )

        resp.raise_for_status()
        data = resp.json()
        created_ids = data.get("createdRecords", [])
        all_records = data.get("records", [])
        record_id = created_ids[0] if created_ids else (all_records[0]["id"] if all_records else None)
        return {"record_id": record_id, "created": bool(created_ids)}


async def dismiss_role(company: str, role: str, url: str = "", source: str = "") -> dict:
    token, base, table = _cfg()

    async with httpx.AsyncClient(timeout=20) as client:
        fields: dict[str, Any] = {"Status": "Dismissed"}
        if company:
            fields["Company"] = company
        if role:
            fields["Role"] = role
        if url:
            fields["PostingURL"] = url
        if source:
            fields["Source"] = source

        if company and role:
            payload = {
                "records": [{"fields": fields}],
                "performUpsert": {"fieldsToMergeOn": ["Company", "Role"]},
                "typecast": True,
            }
            resp = await client.patch(
                f"{_AT_BASE}/{base}/{table}",
                headers=_h(token),
                content=json.dumps(payload),
            )
        else:
            payload = {"records": [{"fields": fields}], "typecast": True}
            resp = await client.post(
                f"{_AT_BASE}/{base}/{table}",
                headers=_h(token),
                content=json.dumps(payload),
            )

        resp.raise_for_status()
        data = resp.json()
        created_ids = data.get("createdRecords", [])
        all_records = data.get("records", [])
        record_id = created_ids[0] if created_ids else (all_records[0]["id"] if all_records else None)
        return {"record_id": record_id, "created": bool(created_ids)}


async def fetch_role_data(company: str, role: str) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=20) as client:
        records = await _fetch_all_records(
            client, ["Company", "Role", "Full JD", "Action", "Fit", "Rationale",
                     "Skill Fit", "Comp Fit", "Strategic Fit", "Domain Fit", "Level Fit"]
        )

    target = _dedup_key(role, company)
    for rec in records:
        f = rec.get("fields", {})
        if _dedup_key(f.get("Role", ""), f.get("Company", "")) == target:
            return {
                "full_jd":   f.get("Full JD", ""),
                "action":    f.get("Action", ""),
                "fit":       int(f["Fit"]) if f.get("Fit") is not None else None,
                "rationale": f.get("Rationale", ""),
                "dimensions": {
                    "skill_fit":    f.get("Skill Fit"),
                    "comp_fit":     f.get("Comp Fit"),
                    "strategic_fit":f.get("Strategic Fit"),
                    "domain_fit":   f.get("Domain Fit"),
                    "level_fit":    f.get("Level Fit"),
                },
            }
    return None


async def save_materials_generated(company: str, role: str) -> None:
    token, base, table = _cfg()

    async with httpx.AsyncClient(timeout=20) as client:
        await _ensure_eval_fields(client)
        fields: dict[str, Any] = {
            "Company":            company,
            "Role":               role,
            "MaterialsGenerated": True,
            "MaterialsDate":      str(date.today()),
        }
        payload = {
            "records": [{"fields": fields}],
            "performUpsert": {"fieldsToMergeOn": ["Company", "Role"]},
            "typecast": True,
        }
        resp = await client.patch(
            f"{_AT_BASE}/{base}/{table}",
            headers=_h(token),
            content=json.dumps(payload),
        )
        resp.raise_for_status()


async def get_roles_list() -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as client:
        await _ensure_eval_fields(client)
        records = await _fetch_all_records(
            client, ["Company", "Role", "Fit", "Status", "Action",
                     "Date Evaluated", "MaterialsGenerated", "Notes"]
        )

    roles = []
    for rec in records:
        f = rec.get("fields", {})
        company = f.get("Company", "")
        role    = f.get("Role", "")
        if not company or not role:
            continue
        fit = f.get("Fit")
        roles.append({
            "company":             company,
            "role":                role,
            "fit_score":           int(fit) if fit is not None else None,
            "status":              _canonical_status(f.get("Status")),
            "action":              f.get("Action"),
            "date_evaluated":      f.get("Date Evaluated"),
            "materials_generated": bool(f.get("MaterialsGenerated")),
            "notes":               f.get("Notes") or "",
        })

    roles.sort(key=lambda x: x.get("date_evaluated") or "", reverse=True)
    return roles


async def update_role(
    company: str,
    role: str,
    status: Optional[str] = None,
    notes: Optional[str] = None,
    date_applied: Optional[str] = None,
) -> dict:
    token, base, table = _cfg()
    async with httpx.AsyncClient(timeout=20) as client:
        await _ensure_eval_fields(client)
        fields: dict[str, Any] = {"Company": company, "Role": role}
        if status is not None:
            fields["Status"] = status
        if notes is not None:
            fields["Notes"] = notes
        if date_applied is not None:
            fields["Date Applied"] = date_applied
        payload = {
            "records": [{"fields": fields}],
            "performUpsert": {"fieldsToMergeOn": ["Company", "Role"]},
            "typecast": True,
        }
        resp = await client.patch(
            f"{_AT_BASE}/{base}/{table}",
            headers=_h(token),
            content=json.dumps(payload),
        )
        resp.raise_for_status()
        data = resp.json()
        all_records = data.get("records", [])
        record_id = all_records[0]["id"] if all_records else None
        return {"record_id": record_id, "updated": True}


async def lookup_roles(roles: list[dict]) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        records = await _fetch_all_records(
            client, ["Company", "Role", "Fit", "Status"]
        )

    # Build full lookup map from all Airtable records
    lookup: dict[str, dict] = {}
    for rec in records:
        f = rec.get("fields", {})
        c = f.get("Company", "")
        r = f.get("Role", "")
        if c and r:
            key = _dedup_key(r, c)
            lookup[key] = {
                "fit_score": f.get("Fit"),
                "status":    f.get("Status"),
                "action":    None,
            }

    # Return only matches for requested roles
    matches: dict[str, dict] = {}
    for item in roles:
        key = _dedup_key(item.get("title", ""), item.get("company", ""))
        if key in lookup:
            matches[key] = lookup[key]

    return {"matches": matches}


async def find_incomplete_records() -> list[dict]:
    """Return records that need any backfill fix."""
    async with httpx.AsyncClient(timeout=30) as client:
        records = await _fetch_all_records(
            client, ["Company", "Role", "Comp", "Full JD", "Source", "Status", "Action", "Fit"]
        )

    incomplete = []
    for rec in records:
        f = rec.get("fields", {})
        full_jd  = f.get("Full JD", "") or ""
        company  = f.get("Company", "") or ""
        role     = f.get("Role", "") or ""
        comp     = f.get("Comp", "") or ""
        source   = f.get("Source", "") or ""
        status   = _canonical_status(f.get("Status")) or ""
        action   = f.get("Action", "") or ""
        fit      = f.get("Fit")

        issues: dict = {}

        # Migrate Action="Explore" → Status when Status is empty or still "Evaluated"
        if action.lower() == "explore" and status in ("", "Evaluated"):
            issues["migrate_explore"] = True

        # Ghost rows: no status, no fit score, but have a Full JD — set to Evaluated
        if not status and full_jd and fit is None:
            issues["set_evaluated"] = True

        # Missing metadata fields that can be extracted from the JD
        if full_jd:
            missing = [
                field for field, val in [("Company", company), ("Role", role), ("Comp", comp)]
                if not val
            ]
            if missing:
                issues["missing"] = missing

        if not issues:
            continue

        incomplete.append({
            "record_id": rec["id"],
            "company":   company,
            "role":      role,
            "comp":      comp,
            "full_jd":   full_jd,
            "source":    source,
            "status":    status,
            "action":    action,
            **issues,
        })

    return incomplete


async def patch_record_by_id(record_id: str, fields: dict) -> None:
    token, base, table = _cfg()
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.patch(
            f"{_AT_BASE}/{base}/{table}/{record_id}",
            headers=_h(token),
            content=json.dumps({"fields": fields, "typecast": True}),
        )
        resp.raise_for_status()


async def get_dashboard() -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        records = await _fetch_all_records(
            client, ["Company", "Role", "Fit", "Status", "Date Applied", "PostingURL"]
        )

    by_status: dict[str, int] = {}
    applied_fits: list[int] = []
    follow_up: list[dict] = []
    cutoff = date.today() - timedelta(days=7)

    for rec in records:
        f = rec.get("fields", {})
        status      = f.get("Status") or "Unknown"
        fit         = f.get("Fit")
        date_str    = f.get("Date Applied")
        company     = f.get("Company", "")
        role        = f.get("Role", "")
        posting_url = f.get("PostingURL", "") or ""

        by_status[status] = by_status.get(status, 0) + 1

        if status == "Applied" and isinstance(fit, (int, float)):
            applied_fits.append(int(fit))

        if status == "Applied" and date_str:
            try:
                if date.fromisoformat(date_str) <= cutoff:
                    follow_up.append({
                        "company":      company,
                        "role":         role,
                        "date_applied": date_str,
                        "fit_score":    int(fit) if fit is not None else None,
                        "posting_url":  posting_url or None,
                    })
            except ValueError:
                pass

    follow_up.sort(key=lambda x: x["date_applied"])

    return {
        "total":             len(records),
        "by_status":         by_status,
        "avg_fit_applied":   round(sum(applied_fits) / len(applied_fits)) if applied_fits else None,
        "follow_up_needed":  follow_up,
    }
