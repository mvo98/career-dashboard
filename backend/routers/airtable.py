from fastapi import APIRouter, HTTPException
from models.airtable_models import (
    SaveEvaluationRequest, SaveEvaluationResponse,
    LookupRequest, LookupResponse,
    DashboardResponse,
)
from services.airtable import save_evaluation, lookup_roles, get_dashboard

router = APIRouter()


@router.post("/airtable/save", response_model=SaveEvaluationResponse)
async def save(req: SaveEvaluationRequest):
    try:
        result = await save_evaluation(
            company=req.company,
            role=req.role,
            fit_score=req.fit_score,
            comp=req.comp,
            action=req.action,
            rationale=req.rationale,
            dimensions=req.dimensions,
            full_jd=req.full_jd,
        )
        return SaveEvaluationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/airtable/lookup", response_model=LookupResponse)
async def lookup(req: LookupRequest):
    try:
        result = await lookup_roles([r.model_dump() for r in req.roles])
        return LookupResponse(matches=result["matches"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/airtable/dashboard", response_model=DashboardResponse)
async def dashboard():
    try:
        return DashboardResponse(**(await get_dashboard()))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
