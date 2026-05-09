from fastapi import APIRouter, HTTPException
from models.job_search import JobSearchRequest, JobSearchResponse, FetchDescriptionRequest, FetchDescriptionResponse
from services.job_apis import search_jobs, fetch_job_description

router = APIRouter()


@router.post("/jobs/search", response_model=JobSearchResponse)
async def search(request: JobSearchRequest):
    try:
        jobs, filtered_count, filter_breakdown = await search_jobs(
            request.titles, request.location, request.salary_floor
        )
        return JobSearchResponse(
            jobs=jobs,
            total=len(jobs),
            filtered_count=filtered_count,
            filter_breakdown=filter_breakdown,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/fetch-description", response_model=FetchDescriptionResponse)
async def fetch_description(request: FetchDescriptionRequest):
    if not request.url:
        raise HTTPException(status_code=400, detail="url is required")
    description, full = await fetch_job_description(request.url)
    return FetchDescriptionResponse(description=description, full=full)
