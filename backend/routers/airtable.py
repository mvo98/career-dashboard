from fastapi import APIRouter, HTTPException
from models.airtable_models import (
    SaveEvaluationRequest, SaveEvaluationResponse,
    LookupRequest, LookupResponse,
    DashboardResponse,
    DismissRequest, DismissResponse,
    RoleListItem, RolesListResponse,
    UpdateRoleRequest, UpdateRoleResponse,
)
from services.airtable import save_evaluation, lookup_roles, get_dashboard, dismiss_role, get_roles_list, update_role

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
            url=req.url,
            source=req.source,
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


@router.post("/airtable/dismiss", response_model=DismissResponse)
async def dismiss(req: DismissRequest):
    try:
        result = await dismiss_role(company=req.company, role=req.role, url=req.url, source=req.source)
        return DismissResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/airtable/roles", response_model=RolesListResponse)
async def roles():
    try:
        items = await get_roles_list()
        return RolesListResponse(roles=[RoleListItem(**r) for r in items])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/airtable/role", response_model=UpdateRoleResponse)
async def update_role_endpoint(req: UpdateRoleRequest):
    try:
        result = await update_role(company=req.company, role=req.role, status=req.status, notes=req.notes)
        return UpdateRoleResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/airtable/dashboard", response_model=DashboardResponse)
async def dashboard():
    try:
        return DashboardResponse(**(await get_dashboard()))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
