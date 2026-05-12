"""
One-time import of job tracker data into Airtable.

Requires these scopes on your Airtable Personal Access Token:
  - data.records:read
  - data.records:write
  - schema.bases:write   ← needed to create fields the first time

Run from repo root:
  source backend/.venv/bin/activate && python scripts/import_jobs.py
"""

import os
import sys
import json
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

TOKEN    = os.environ["AIRTABLE_TOKEN"]
BASE     = os.environ["AIRTABLE_BASE_ID"]
TABLE    = os.environ["AIRTABLE_TABLE_ID"]
HEADERS  = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
BASE_URL = f"https://api.airtable.com/v0/{BASE}/{TABLE}"
META_URL = f"https://api.airtable.com/v0/meta/bases/{BASE}/tables/{TABLE}"

# ── Field definitions ─────────────────────────────────────────────────────────
# Airtable field types: singleLineText, number, singleSelect, date, multilineText

FIELD_SPECS = [
    # (name, type, options)
    ("Company",      "singleLineText", {}),
    ("Role",         "singleLineText", {}),
    ("Fit",          "number",         {"precision": 0}),
    ("Comp",         "singleLineText", {}),
    ("Status",       "singleSelect",   {"choices": [
        {"name": "Applied"},
        {"name": "Responded"},
        {"name": "Saved"},
        {"name": "Explore"},
        {"name": "Skip"},
    ]}),
    ("Date Applied", "date",           {"dateFormat": {"name": "iso"}}),
    ("Notes",        "multilineText",  {}),
]

# ── Job data ──────────────────────────────────────────────────────────────────
# XiFin: duplicate Applied row removed — only Responded row kept.

JOBS = [
    ("Motion Recruitment",  "AI Customer Implementation Engineer",   75, "Unknown",           "Applied",   "2026-05-05", "Resume v2 submitted. Await recruiter response."),
    ("Nearmap",             "Enterprise Technical Support Engineer", 72, "Not listed",         "Applied",   "2026-05-05", "Cover letter. Salary ask $95k."),
    ("Figma",               "Enterprise Support Specialist",         70, "$94k-$136k",         "Applied",   "2026-05-05", "Easy Apply."),
    ("DoorDash",            "Technical Implementation Specialist",   70, "$78k-$115k",         "Applied",   "2026-05-05", "Cover letter. Deadline July 1."),
    ("ESET",                "Sales Engineer I",                      70, "$105k-$132k OTE",    "Applied",   "2026-05-05", "0 yrs cyber/SaaS disclosed."),
    ("Included Health",     "Solutions Engineer",                    68, "$77k-$131k",         "Applied",   "2026-05-05", "Remote. Healthcare domain new."),
    ("Wheelhouse",          "Partnership Support Engineer",          65, "$136k-$152k",        "Applied",   "2026-05-05", "Cover letter. Strong comp."),
    ("XiFin",               "Assoc. Software Support Engineer",      65, "$80k-$97k",          "Responded", "2026-05-05", "Call scheduled with Rose. Interview Monday May 11."),
    ("Vimo",                "BizOps Engineer",                       55, "Not listed",         "Applied",   "2026-05-05", "Gov SaaS. 3yr scripting disclosed."),
    ("One Inc",             "Software Implementation Analyst",       68, "$110k-$120k",        "Applied",   "2026-05-06", "Insurance payments. API/implementation match."),
    ("Ashby",               "High Touch Implementation Specialist",  65, "$120k-$140k",        "Applied",   "2026-05-06", "ATS platform. Strong comp."),
    ("Moody's",             "Client Service Lending Solutions",      68, "$67k-$98k",          "Applied",   "2026-05-06", "Bilingual required. Finance domain new."),
    ("Pitney Bowes",        "Technical Program Specialist",          65, "$101k-$120k",        "Applied",   "2026-05-06", "Works EST hours from SD."),
    ("PointClickCare",      "Software Implementation Consultant",    65, "$80k-$89k+bonus",    "Applied",   "2026-05-06", "Healthcare tech. 30% travel."),
    ("Conduent",            "Application Software Support Engineer", 60, "$80k-$104k",         "Applied",   "2026-05-06", "Salary ask $95k. On-call 1 in 2 months."),
    ("FICO",                "Software Support Engineer",             65, "$86k-$135k",         "Applied",   "2026-05-06", "NYSE listed. Financial analytics."),
    ("Tillster",            "Associate Technical Project Manager",   72, "$75k-$90k",          "Responded", "2026-05-06", "Bilingual required. SD onsite. Call scheduled Friday May 15."),
    ("IBM",                 "Entry Level Technical Support Engineer",65, "$80k-$100k",         "Applied",   "2026-05-06", "Remote TBD. Applied San Jose location."),
    ("Brain Corp",          "Technical Support Engineer IV",         55, "$91k-$119k",         "Saved",     None,         "SD based. Robotics. 6yr req is stretch."),
    ("General Atomics",     "Applications Administrator",            60, "$71k-$109k",         "Skip",      "2026-05-05", "US citizenship required."),
    ("Qualcomm",            "Edge AI Pre-Sales Engineer",            55, "$130k-$195k",        "Explore",   "2026-05-05", "Embedded gap. Manufacturing domain helps."),
    ("ResMed",              "Implementation Consultant",             60, "$89k-$133k",         "Skip",      "2026-05-05", "75% travel required."),
    ("XILO",                "Technical Implementation Manager",      70, "Not listed",         "Skip",      "2026-05-05", "Startup skip."),
    ("Workiz",              "Onboarding Specialist",                 55, "$70k-$85k OTE",      "Skip",      "2026-05-05", "Startup skip."),
    ("First Advantage",     "Solutions Engineer",                    55, "$95k-$140k",         "Skip",      "2026-05-05", "50% travel required."),
    ("Dassault/BIOVIA",     "Services Software Consultant",          45, "$109k-$128k",        "Skip",      "2026-05-05", "Lab/life sciences required."),
    ("Netradyne",           "Product Success Engineer",              45, "$70k-$95k",          "Skip",      "2026-05-05", "Fully onsite. Hardware focus."),
    ("Deloitte",            "QRM Tech & Analytics Consultant",       40, "$60k-$110k",         "Skip",      "2026-05-05", "Internal ops. Floor below current."),
    ("Whatnot",             "Customer Success Engineer",             40, "$170k-$190k",        "Skip",      "2026-05-05", "Requires LA/SF."),
    ("GitGuardian",         "Sales Engineer",                        40, "$165k-$190k",        "Skip",      "2026-05-05", "4-7yr cybersecurity required."),
    ("Google",              "Customer Sales Engineer",               25, "$141k-$204k",        "Skip",      "2026-05-05", "8yr required. Wrong level."),
    ("Databricks",          "Solutions Architect Hunter",            30, "$180k-$247k",        "Skip",      "2026-05-05", "Too senior."),
    ("CONAM",               "Business App Tech Yardi",               25, "$62k-$71k",          "Skip",      "2026-05-05", "Below current salary."),
    ("Booz Allen",          "Cross Domain Solution Engineer",        20, "$61k-$141k",         "Skip",      "2026-05-05", "TS/SCI clearance required."),
]


def create_fields(client: httpx.Client) -> None:
    """Create all required fields. Skips fields that already exist."""
    # Fetch existing field names first
    r = client.get(f"{META_URL}/fields")
    if r.status_code == 403:
        print("ERROR: token is missing 'schema.bases:write' scope.")
        print("  → Go to airtable.com/create/tokens, edit your token,")
        print("    add scopes: schema.bases:read  schema.bases:write")
        print("    then update AIRTABLE_TOKEN in .env and re-run.")
        sys.exit(1)

    existing = {f["name"] for f in r.json().get("fields", [])}

    for name, ftype, options in FIELD_SPECS:
        if name in existing:
            print(f"  field '{name}' already exists — skipping")
            continue
        body: dict = {"name": name, "type": ftype}
        if options:
            body["options"] = options
        cr = client.post(f"{META_URL}/fields", content=json.dumps(body))
        if cr.status_code == 200:
            print(f"  created field '{name}' ({ftype})")
        else:
            print(f"  WARN: could not create '{name}': {cr.text[:120]}")
        time.sleep(0.2)


def build_record(row: tuple) -> dict:
    company, role, fit, comp, status, date_applied, notes = row
    fields: dict = {
        "Company": company,
        "Role":    role,
        "Fit":     fit,
        "Comp":    comp,
        "Status":  status,
        "Notes":   notes,
    }
    if date_applied:
        fields["Date Applied"] = date_applied
    return {"fields": fields}


def batches(lst: list, size: int = 10):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def main() -> None:
    print(f"Target: base={BASE}  table={TABLE}")
    print(f"Rows to import: {len(JOBS)}\n")

    with httpx.Client(headers=HEADERS, timeout=20) as client:
        print("Step 1 — ensuring fields exist…")
        create_fields(client)

        print(f"\nStep 2 — importing {len(JOBS)} records…")
        created = 0
        errors: list[str] = []

        for i, chunk in enumerate(batches([build_record(r) for r in JOBS]), 1):
            resp = client.post(BASE_URL, content=json.dumps({"records": chunk, "typecast": True}))
            if resp.status_code == 200:
                n = len(resp.json().get("records", []))
                created += n
                print(f"  batch {i}: {n} records created")
            else:
                err = resp.json().get("error", resp.text[:120])
                errors.append(f"batch {i}: {err}")
                print(f"  batch {i}: ERROR — {err}")
            time.sleep(0.25)

    print(f"\n{'─' * 40}")
    print(f"Created : {created} / {len(JOBS)}")
    print(f"Errors  : {len(errors)}")
    for e in errors:
        print(f"  {e}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
