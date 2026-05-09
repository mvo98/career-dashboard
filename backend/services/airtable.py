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
    ("Date Evaluated", "date",           {"dateFormat": {"name": "iso"}}),
]

_DIM_MAP = {
    "skill_fit":        "Skill Fit",
    "compensation_fit": "Comp Fit",
    "strategic_fit":    "Strategic Fit",
    "domain_fit":       "Domain Fit",
    "level_fit":        "Level Fit",
}

_eval_fields_ensured = False


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
) -> dict:
    token, base, table = _cfg()

    async with httpx.AsyncClient(timeout=20) as client:
        await _ensure_eval_fields(client)

        fields: dict[str, Any] = {
            "Fit":            fit_score,
            "Action":         action,
            "Rationale":      rationale,
            "Full JD":        full_jd[:99_000],
            "Date Evaluated": str(date.today()),
            "Status":         "Evaluated",
        }
        if company:
            fields["Company"] = company
        if role:
            fields["Role"] = role
        if comp:
            fields["Comp"] = comp
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


async def get_dashboard() -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        records = await _fetch_all_records(
            client, ["Company", "Role", "Fit", "Status", "Date Applied"]
        )

    by_status: dict[str, int] = {}
    applied_fits: list[int] = []
    follow_up: list[dict] = []
    cutoff = date.today() - timedelta(days=7)

    for rec in records:
        f = rec.get("fields", {})
        status     = f.get("Status") or "Unknown"
        fit        = f.get("Fit")
        date_str   = f.get("Date Applied")
        company    = f.get("Company", "")
        role       = f.get("Role", "")

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
