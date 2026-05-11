import os
import json
from pathlib import Path
from google import genai
from google.genai import types

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
  • Sentence 2 MUST mirror JD language — extract actual words and phrases verbatim from the JD. \
Do not substitute synonyms.
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

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    return json.loads(response.text)
