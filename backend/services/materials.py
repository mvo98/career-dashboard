import os
import json
from pathlib import Path
from google import genai
from google.genai import types
from services.gemini import GeminiOverloadedError, GeminiRateLimitError, _classify_gemini_exc

_PROFILE_PATH = Path(__file__).parent.parent.parent / "profile.md"
_WRITING_GUIDE_PATH = Path(__file__).parent.parent.parent / "writing_guide.md"


def _get_profile() -> str:
    return _PROFILE_PATH.read_text()


def _get_writing_guide() -> str:
    if not _WRITING_GUIDE_PATH.exists():
        raise FileNotFoundError(
            "writing_guide.md not found at repo root. "
            "Create it with your resume formula, cover letter structure, signal mapping table, and voice guide."
        )
    return _WRITING_GUIDE_PATH.read_text()


def generate_materials(
    company: str,
    role: str,
    full_jd: str,
    evaluation: dict,
) -> dict:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    profile = _get_profile()
    writing_guide = _get_writing_guide()

    fit = evaluation.get("fit") or "—"
    action = evaluation.get("action") or "—"
    rationale = evaluation.get("rationale") or "—"
    dims = evaluation.get("dimensions", {})
    dim_lines = "\n".join(
        f"  {k.replace('_', ' ').title()}: {v}"
        for k, v in dims.items()
        if v is not None
    )

    prompt = f"""You are a career materials specialist generating tailored job application materials.

Follow the Writing Guide EXACTLY. Its resume formula, cover letter structure, signal mapping table, \
banned phrases list, and voice rules are all authoritative. Do not improvise or deviate.

===== CANDIDATE BACKGROUND =====
{profile}

===== WRITING GUIDE =====
{writing_guide}

===== TARGET ROLE =====
Company: {company}
Role: {role}

===== JOB DESCRIPTION =====
{full_jd}

===== EVALUATION CONTEXT =====
Recommendation: {action}
Overall Fit Score: {fit}/100
Rationale: {rationale}
Dimension Scores:
{dim_lines}

===== INSTRUCTIONS =====

Step 1 — SIGNAL SCANNING
Scan the JD against every row in the Signal Mapping Table in the Writing Guide.
Identify every signal that is present. For each, record the signal label and the exact emphasis instruction it triggers.

Step 2 — RESUME SUMMARY
Write exactly 3 sentences using the formula defined in the Writing Guide.
Critical rules:

  SENTENCE 1 — ROLE LABEL: The role label in sentence 1 must come from this fixed list based on JD type.
  Never use the exact JD title. Never use "architect" or any title that overstates current seniority.
    - Implementation / onboarding JDs → "Implementation engineer"
    - Solutions Engineer JDs → "Solutions engineer"
    - Support Engineer JDs → "Technical support engineer"
    - TAM / Account / Customer Success JDs → "Technical account manager"
    - Architect / Senior / Principal JDs → "Implementation engineer"

  SENTENCE 2 — BUILT ONLY FROM MAURICIO'S ACTUAL EXPERIENCE:
  Sentence 2 must be constructed ONLY from the work examples and technical skills described in \
the CANDIDATE BACKGROUND and the calibration examples in the Writing Guide (Part 3). \
Do NOT reference anything from the JD in sentence 2. Do NOT paraphrase JD responsibilities. \
Do NOT copy JD phrases even loosely.

  Instead: identify which of Mauricio's actual documented experiences are most relevant to the \
JD themes, then describe those experiences in his voice. The correct process is:
    1. Read the JD to understand what it cares about (themes, not phrases).
    2. Look at Mauricio's actual work history in the CANDIDATE BACKGROUND for matching experiences.
    3. Write sentence 2 using only those real experiences, phrased in Mauricio's voice.

  Concrete mapping examples (follow this pattern):
    - JD mentions data validation → use Mauricio's SQL debugging and root cause analysis experience
    - JD mentions API integration → use Mauricio's REST API troubleshooting and webhook debugging
    - JD mentions UAT / testing → use Mauricio's client go-live and configuration testing experience
    - JD mentions stakeholder communication → use Mauricio's enterprise client communication experience
    - JD mentions project management → use Mauricio's multi-client implementation coordination
    - JD mentions infrastructure → use Mauricio's Docker Swarm / Traefik migration work
    - JD mentions automation → use Mauricio's Python scripting and workflow automation work

  SENTENCE 3 — BILINGUAL ANGLE + ONE PROFILE DIFFERENTIATOR ONLY:
  Sentence 3 must include the bilingual English/Spanish angle and exactly one additional \
differentiator drawn from Mauricio's actual background. Do NOT add phrases sourced from the JD \
into sentence 3. The additional differentiator should be a genuine characteristic (e.g., \
remote EST coverage, sole Spanish-language resource, contractor coordination in Mexico) — \
never a restatement of a JD requirement.

  • No passive voice in any sentence.
  • No banned phrases listed in the Writing Guide.
  • Incorporate the emphasis required by the detected signals.

Step 3 — COVER LETTER
Write exactly 3 paragraphs using the structure defined in the Writing Guide.
Critical rules:
  • Paragraph 1: Function-first opening. Lead with what you DO and for whom, not with "I am a …" \
or personal narrative.
  • Paragraph 2: One specific, named proof point from the candidate's work history in the Background. \
Must include: employer/project name, specific action taken, and a measurable or concrete outcome. \
No vague claims.
  • Paragraph 3: Genuine close that names this company and this role specifically. \
No generic "I look forward to hearing from you" close.
  • End with a sign-off block. Use the candidate's name and contact details from the Background section.
  • Mirror JD language throughout.
  • Apply all emphasis instructions from detected signals.

===== OUTPUT FORMAT =====

Return a JSON object with this exact structure:

{{
  "resume_summary": "<exactly 3 sentences with no internal line breaks>",
  "cover_letter": "<full cover letter: 3 paragraphs separated by \\n\\n, followed by \\n\\n and the sign-off block>",
  "jd_signals": ["<signal label from the Signal Mapping Table>", ...],
  "emphasis_applied": "<1–2 sentences: which signals were detected and what specific emphasis was applied>",
  "proof_point_selected": "<employer/project name + action + outcome from paragraph 2, in one sentence>"
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

    return json.loads(response.text)
