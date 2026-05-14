import os
import json
from pathlib import Path
from typing import Optional
from google import genai
from google.genai import types

_PROFILE_PATH = Path(__file__).parent.parent.parent / "profile.md"


class GeminiOverloadedError(Exception):
    """Gemini returned 503 / service unavailable."""


class GeminiRateLimitError(Exception):
    """Gemini returned 429 / resource exhausted."""


def _classify_gemini_exc(exc: Exception) -> Optional[str]:
    """Return 'overloaded', 'rate_limit', or None (non-retryable)."""
    s = str(exc).lower()
    if any(k in s for k in ("503", "service unavailable", "unavailable", "overloaded")):
        return "overloaded"
    if any(k in s for k in ("429", "resource_exhausted", "rate", "quota", "too many")):
        return "rate_limit"
    return None


def _get_profile() -> str:
    if _PROFILE_PATH.exists():
        return _PROFILE_PATH.read_text()
    content = os.environ.get("PROFILE_CONTENT")
    if content:
        return content
    raise FileNotFoundError(
        "profile.md not found and PROFILE_CONTENT environment variable is not set."
    )


def evaluate_job_fit(job_description: str) -> dict:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    profile = _get_profile()

    prompt = f"""You are a career advisor evaluating job fit for a specific candidate using a structured multi-dimensional rubric.
The candidate background below tells you what skills and experience the candidate has.
The SCORING RUBRIC section below is the authoritative guide — follow it exactly, do not infer or improvise.

===== CANDIDATE BACKGROUND =====
{profile}

===== JOB DESCRIPTION =====
{job_description}

===== SCORING RUBRIC =====

## DIMENSION 1 — SKILL FIT (weight 0.30)

Skill Fit measures two-sided alignment: whether the JD requires skills the candidate has (utilization)
AND whether the candidate has skills the JD requires (no gaps). Both directions matter.

### Step 1 — Check utilization of core technical skills

The candidate's core technical skills are:
  SQL, Python, REST APIs / API integration, Docker, Linux / command line,
  hands-on debugging, system configuration, Azure cloud services

Count how many of these the JD actively requires or strongly prefers.

  6–8 core skills required → utilization is STRONG  → start at 100, then apply gap penalties below
  3–5 core skills required → utilization is MODERATE → start at 75, then apply gap penalties below
  1–2 core skills required → utilization is WEAK     → start at 50, then apply gap penalties below
  0 core skills required   → utilization is NONE     → start at 35, then apply gap penalties below

CRITICAL RULE: A role that does NOT require core technical skills is NOT a strong skill match —
it is a weak one. Underutilization of key skills scores 35–50, not 90–100.
This applies to coordination roles, functional support roles, project management roles,
and any JD whose technical requirements are limited to MS Office, communication,
stakeholder management, or process documentation.

### Step 2 — Apply gap penalties for required skills the candidate lacks

Category A — Learnable in 30 days (−3 each):
  Specific SaaS admin (Zendesk, Salesforce, HubSpot), Kubernetes basics (candidate has Docker),
  specific cloud console navigation (candidate has Azure → can learn AWS console), Postman,
  JIRA/Confluence, PowerShell scripting

Category B — Learnable in 3–6 months (−8 each):
  Java basics (candidate has Python/JS; logic transfers), AWS certifications, specific ERP
  (NetSuite, SAP), HL7/FHIR basics, Splunk/Grafana dashboards, Kubernetes advanced,
  CI/CD pipeline management

Category C — Fundamental domain gap (−15 each):
  Sterile reprocessing / medical device hardware, power electronics / electrical engineering,
  embedded systems (C/C++, RTOS, JTAG), cybersecurity architecture (SIEM, SOAR, XDR, Zero Trust),
  big data engineering (Spark, Hadoop, Kafka, Databricks), TS/SCI clearance,
  EHR clinical workflow expertise, financial derivatives / quantitative modeling

If the JD requires 3 or more Category C gaps simultaneously → hard_skip_triggered = true.
Score floor is 0.

---

## DIMENSION 2 — COMPENSATION FIT (weight 0.25)

Apply these rules in order. The first matching rule determines the score.

Rule 1 — Hard Skip: Entire comp range is below $80,000 → hard_skip_triggered = true, score = 0.
  Example: $65k–$78k → hard skip. $70k–$85k → borderline; only evaluate if role fit is 75%+.

Rule 2 — Ceiling matters more than floor: If ceiling ≥ $95k, role is worth evaluating regardless of floor.
  Score based on ceiling:
    $120k+      → score = 95
    $100k–$119k → score = 85
    $85k–$99k   → score = 70
    $75k–$84k   → score = 55
    Below $75k  → score = 10 (Rule 1 hard skip likely already triggered)

Rule 3 — OTE / Commission roles: Use base pay only (not OTE) to determine threshold.
  If base is unspecified and only OTE is given → score = 45 (flag as risk).
  If base is confirmed above $85k → evaluate normally using ceiling tier.

Rule 4 — No salary listed: Score = 50. Do NOT auto-skip, but do NOT raise above 55.
  If company is established (recognizable name) and role type is Tier 1 or Tier 2 → keep at 50 and note to verify in recruiter call.

Rule 5 — Hourly roles: Annualize at 2080 hours, then apply above rules.
  $40/hr = $83,200 → score = 70. $35/hr = $72,800 → hard skip (Rule 1).

---

## DIMENSION 3 — STRATEGIC FIT (weight 0.20)

### Step 1: Classify the role type. Use the EXACT criteria below — this is the most common source of scoring error.

TIER 1 — Energizing (base score 90):
  BOTH conditions must be true:
    (a) The role serves EXTERNAL paying customers (not internal employees or internal teams)
    (b) The role has technical depth: implementation ownership, solution design, demos, POCs, or post-sale technical ownership
  Matching roles: Implementation Engineer/Specialist, Solutions Engineer, Pre-Sales Engineer,
    Customer Success Engineer, Technical Account Manager
  Key JD phrases: "implementation lifecycle," "kickoff to go-live," "client onboarding," "customer demos,"
    "POC," "discovery sessions," "post-sale technical," "client-facing technical"
  Anti-patterns (these are NOT Tier 1): internal operations support, supporting internal employees,
    reactive-only technical support with no implementation component

TIER 2 — Good Fit (base score 70):
  BOTH conditions must be true:
    (a) The role serves EXTERNAL paying customers (not internal employees or internal teams)
    (b) The work is reactive technical support (L2/L3), NOT implementation or solution ownership
  Matching roles: Application Support Engineer (external), L2/L3 Technical Support Engineer (external),
    Integration Engineer (external-facing), Associate Software Support Engineer
  Key JD phrases: "technical support," "L2/L3," "troubleshoot," "escalation," "application support,"
    "external clients," "customers" (in context of external paying customers)
  CRITICAL DISCRIMINATOR — ask: who are the "customers" this role supports?
    If external paying clients → Tier 2 (or higher)
    If internal employees or internal business teams → Tier 3 (not Tier 2)

TIER 3 — Acceptable (base score 50):
  The role supports INTERNAL teams, internal processes, or a company's own tools/operations.
  Regardless of technical depth, if the beneficiaries are internal, this is Tier 3.
  Matching roles: BizOps Engineer, Business Systems Analyst, Internal IT Support,
    functional support for a company's own SaaS stack, roles inside consulting firms supporting
    internal practice processes (e.g., Deloitte QRM ops, internal risk platforms)
  Key JD phrases: "internal stakeholders," "business users," "internal teams," "enterprise tools,"
    "support business operations," "enable internal processes," "cross-functional internal collaboration"
  Anti-patterns (these are NOT Tier 3): any role that explicitly names external clients or paying customers

TIER 4 — Step Backward (base score 20) — also triggers hard_skip for pure cases:
  Pure L1 helpdesk: ticket resolution with no engineering component, password resets, user provisioning
  Pure sales: Account Executive, SDR, BDR — no technical component
  Pure software engineering: coding-only role with no client-facing or implementation component
  People management: Support Manager, Team Lead with no IC technical work
  Hard skip condition: if the role is PURELY one of these with no technical component → hard_skip_triggered = true

### Step 2: Apply green flag bonuses (add to tier base, clamp final result to 100 max):

Strong green flags (+12 each):
  "Bilingual Spanish required or preferred" — immediately narrows candidate pool
  "Manufacturing," "industrial," "MES," "production floor" — direct domain match
  "Remote-first" or "fully remote"
  Established recognizable company: IBM, FICO, Moody's, Conduent, Pitney Bowes
  "2–4 years experience required" — perfect level match
  Transparent salary range listed in JD

Moderate green flags (+5 each):
  San Diego headquarters or office
  Healthcare tech (growing sector, adjacent in complexity)
  "Client-facing technical role" explicitly in title or description
  Cross-functional collaboration with Product and Engineering mentioned
  AI tools mentioned (Cursor, Claude, Copilot) — candidate uses these daily
  Post-sales technical ownership described
  "Implementation lifecycle" or "kickoff to go-live" language
  Tuition reimbursement offered
  401k with match above 3%

Mild green flags (+2 each):
  Python mentioned as a plus
  Docker or containerization mentioned
  SQL proficiency required
  Multiple database types mentioned

### Step 3: Apply location rule (evaluate before red flags):

ONSITE LOCATION RULE — apply exactly one of these cases:
  Case A — Onsite in San Diego or Santee CA: Treat identically to hybrid. No penalty. No bonus.
    Applies when: JD says onsite/in-office AND city is San Diego or Santee (California).
  Case B — Fully remote or remote-first: Apply the "Remote-first" strong green flag (+12) already listed above.
  Case C — Hybrid (some remote, some in-office): No penalty, no bonus.
  Case D — Onsite required, city is NOT San Diego or Santee, no remote option: Apply −20 penalty.
    This reflects a real lifestyle and relocation cost. Even high-tier roles are significantly
    less attractive when they require leaving San Diego.
  Case E — Location not specified or unclear: No penalty, no bonus.

### Step 4: Apply red flag penalties (subtract from running total, floor at 0):

High caution (−10 each):
  Vague or no salary listed at an established company
  "Fast-paced environment" at a company under 100 employees
  Commission or variable pay is primary compensation
  Role reports directly to CEO or founder
  "Wear many hats" language anywhere in JD
  On-call rotation including weekends
  30%+ travel required

Moderate caution (−5 each):
  No company name listed (staffing agency posting)
  JD is buzzword-heavy with no specific product mentioned
  "High-growth" language without established revenue proof
  Domain expertise required in: legal, medical devices, sterile processing, power electronics, embedded systems
  Equity as primary compensation differentiator
  Required certifications not in candidate profile: CISSP, CCSP, RHCSA
  Job posted through multiple staffing agencies simultaneously

Low caution (−2 each):
  Java mentioned as required (not preferred)
  Kubernetes required
  Agile/Scrum certification required
  Healthcare domain preferred

---

## DIMENSION 4 — DOMAIN FIT (weight 0.15)

Score based on how closely the company's industry and product domain match the candidate's background:
  Manufacturing / industrial / MES / production floor                → 90–100
  Healthcare tech / complex enterprise SaaS (adjacent in complexity) → 60–75
  General enterprise software / fintech / logistics                  → 50–65
  Unrelated domain (media, consumer, gaming, retail)                 → 30–50
  Hard domain gap (legal tech, embedded hardware, biotech)           → 20–35

---

## DIMENSION 5 — LEVEL FIT (weight 0.10)

Score based on how well the required experience matches the candidate's ~3 years of experience:
  "2–4 years required"            → 95 (perfect match)
  "3–5 years required"            → 85
  Entry-level / "1–2 years"       → 70
  "4–6 years required"            → 75
  "5–7 years" or "senior" level   → 55
  "7+ years" or "staff/principal" → 35
  No level specified              → 75

---

## HARD SKIP CONDITIONS — any one of these forces action = "Skip" regardless of score:

  1. Entire comp range is below $80,000 (Rule 1 above)
  2. Role is purely Tier 4 with no technical component (L1 helpdesk, pure SDR/BDR/AE, pure management)
  3. JD simultaneously requires 3 or more Category C skill gaps

---

## ACTION THRESHOLDS (applied server-side, but include your recommendation):

  "Apply"   → overall_score ≥ 70 AND hard_skip_triggered = false
  "Explore" → overall_score 50–69 AND hard_skip_triggered = false
  "Skip"    → overall_score < 50 OR hard_skip_triggered = true

---

## TALKING POINTS

3–5 specific, actionable talking points the candidate should use for THIS role.
Reference actual skills, experiences, companies, and outcomes from the candidate background.
No generic statements. Each point should be usable verbatim in an interview or cover letter.

===== OUTPUT FORMAT =====

Return a JSON object with this exact structure:

{{
  "overall_score": <integer 0-100, weighted average: skill×0.30 + comp×0.25 + strategic×0.20 + domain×0.15 + level×0.10>,
  "action": <"Apply" | "Explore" | "Skip">,
  "action_justification": "<1-2 sentence justification citing the most decisive factor>",
  "hard_skip_triggered": <true | false>,
  "hard_skip_reason": <null or string naming which exact hard skip condition was met>,
  "extracted_comp": <null or string: salary/compensation found ONLY in the JD description body text. CRITICAL: do NOT extract the "Salary:" header line at the top of this input — that is a pre-populated structured field. Only return a value if the job description body itself mentions compensation (look for phrases like "base salary", "salary range", "compensation", "$X–$Y", "OTE", "total compensation", "pay range"). E.g. "$90k–$120k", "$140,000/yr", "Up to $150k + equity". Return null if comp is not mentioned in the body text.>,
  "extracted_company": <null or string: company name found in the JD, or null if not clearly stated>,
  "extracted_role": <null or string: exact job title from the JD header or body, or null if not found>,
  "dimensions": {{
    "skill_fit": {{
      "score": <integer 0-100>,
      "weight": 0.30,
      "reason": "<state how many core technical skills the JD requires (utilization level and starting score), then cite each gap found, its category, and the penalty applied>"
    }},
    "compensation_fit": {{
      "score": <integer 0-100>,
      "weight": 0.25,
      "reason": "<state which rule applied, the exact range found, and how the score was derived>"
    }},
    "strategic_fit": {{
      "score": <integer 0-100>,
      "weight": 0.20,
      "reason": "<state the tier assigned and WHY (internal vs external clients), state which location case applied (A/B/C/D/E) and the penalty or bonus, list each other flag applied>"
    }},
    "domain_fit": {{
      "score": <integer 0-100>,
      "weight": 0.15,
      "reason": "<name the industry/domain and the matching band used>"
    }},
    "level_fit": {{
      "score": <integer 0-100>,
      "weight": 0.10,
      "reason": "<state the exact experience level specified in the JD and the matching score>"
    }}
  }},
  "talking_points": [<3-5 strings>]
}}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
    except Exception as exc:
        kind = _classify_gemini_exc(exc)
        if kind == "overloaded":
            raise GeminiOverloadedError("Gemini is experiencing high demand.") from exc
        if kind == "rate_limit":
            raise GeminiRateLimitError("Rate limit reached.") from exc
        raise

    result = json.loads(response.text)

    # Recompute overall_score server-side from dimension scores for accuracy
    if "dimensions" in result:
        overall = sum(
            d["score"] * d["weight"]
            for d in result["dimensions"].values()
        )
        result["overall_score"] = round(overall)

    # Derive action server-side to ensure consistency with the computed score
    hard_skip = result.get("hard_skip_triggered", False)
    score = result["overall_score"]
    if hard_skip or score < 50:
        result["action"] = "Skip"
    elif score >= 70:
        result["action"] = "Apply"
    else:
        result["action"] = "Explore"

    return result


def extract_jd_metadata(jd: str) -> dict:
    """Extract company name, role title, and comp from a JD. Returns {company, role, comp}."""
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    prompt = f"""Extract metadata from this job description. Return null for any field not clearly stated.

===== JOB DESCRIPTION =====
{jd[:6000]}

===== OUTPUT FORMAT =====
Return a JSON object with exactly these fields:
{{
  "company": "<company name, or null>",
  "role": "<exact job title, or null>",
  "comp": "<compensation range or amount e.g. '$90k–$120k', '$140,000/yr', 'Up to $150k + equity', or null>"
}}"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return json.loads(response.text)
    except Exception as exc:
        kind = _classify_gemini_exc(exc)
        if kind == "overloaded":
            raise GeminiOverloadedError("Gemini is experiencing high demand.") from exc
        if kind == "rate_limit":
            raise GeminiRateLimitError("Rate limit reached.") from exc
        raise
