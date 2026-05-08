import os
import json
from pathlib import Path
from google import genai
from google.genai import types

_PROFILE_PATH = Path(__file__).parent.parent.parent / "profile.md"


def _get_profile() -> str:
    return _PROFILE_PATH.read_text()


def evaluate_job_fit(job_description: str) -> dict:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    profile = _get_profile()

    prompt = f"""You are a career advisor analyzing job fit for a specific candidate.

CANDIDATE PROFILE:
{profile}

JOB DESCRIPTION:
{job_description}

Analyze the job description against the candidate profile and return a JSON object with exactly these fields:
- "fit_score": integer 0-100 representing overall fit percentage
- "strengths": array of exactly 3 strings — specific strengths this candidate has for THIS role (reference actual skills/experiences from the profile, not generic statements)
- "gaps": array of exactly 3 strings — specific gaps or challenges for THIS role (be honest and specific)
- "talking_points": array of 3-5 strings — tailored talking points the candidate should use in interviews or a cover letter for THIS specific role (actionable, specific, referenced to the candidate's actual background)

Be direct, factual, and specific. Reference actual experience and skills from the profile. No filler or generic statements."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    return json.loads(response.text)
