import asyncio
from fastapi import APIRouter, HTTPException
from models.job_fit import JobFitRequest, JobFitResponse
from services.gemini import evaluate_job_fit

router = APIRouter()


@router.post("/evaluate", response_model=JobFitResponse)
async def evaluate(request: JobFitRequest):
    try:
        result = await asyncio.to_thread(evaluate_job_fit, request.job_description)
        return JobFitResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
