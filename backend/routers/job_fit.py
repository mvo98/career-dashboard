import asyncio
from fastapi import APIRouter, HTTPException
from models.job_fit import JobFitRequest, JobFitResponse
from services.gemini import evaluate_job_fit, GeminiOverloadedError, GeminiRateLimitError

router = APIRouter()


def _brief(msg: str) -> str:
    first = msg.split(".")[0].strip()
    return first[:120] if first else "Unexpected error"


@router.post("/evaluate", response_model=JobFitResponse)
async def evaluate(request: JobFitRequest):
    try:
        result = await asyncio.to_thread(evaluate_job_fit, request.job_description)
        return JobFitResponse(**result)
    except GeminiOverloadedError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except GeminiRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=_brief(str(e)))
