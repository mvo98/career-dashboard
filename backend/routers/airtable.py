import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from models.airtable_models import (
    SaveEvaluationRequest, SaveEvaluationResponse,
    LookupRequest, LookupResponse,
    DashboardResponse,
    DismissRequest, DismissResponse,
    RoleListItem, RolesListResponse,
    UpdateRoleRequest, UpdateRoleResponse,
)
from services.airtable import (
    save_evaluation, lookup_roles, get_dashboard, dismiss_role,
    get_roles_list, update_role, find_incomplete_records, patch_record_by_id,
)
from services.gemini import extract_jd_metadata

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
        result = await update_role(company=req.company, role=req.role, status=req.status, notes=req.notes, date_applied=req.date_applied)
        return UpdateRoleResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/airtable/dashboard", response_model=DashboardResponse)
async def dashboard():
    try:
        return DashboardResponse(**(await get_dashboard()))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/airtable/backfill")
async def backfill():
    async def generate():
        records = await find_incomplete_records()
        total = len(records)
        yield json.dumps({"type": "total", "total": total}) + "\n"

        done = 0
        for rec in records:
            try:
                updated_fields: dict = {}
                updated: list = []

                # Fix 1: early rows where Action="Explore" was used as a status marker
                if rec.get("migrate_explore"):
                    updated_fields["Status"] = "Explore"
                    updated_fields["Action"] = ""  # clear the misused column
                    updated.append("Status←Explore")

                # Fix 2: ghost rows with no status and no fit score
                if rec.get("set_evaluated") and "Status" not in updated_fields:
                    updated_fields["Status"] = "Evaluated"
                    updated.append("Status=Evaluated")

                # Fix 3: extract missing Company/Role/Comp from the JD
                if rec.get("missing") and rec.get("full_jd"):
                    extracted = await asyncio.to_thread(extract_jd_metadata, rec["full_jd"])
                    if "Company" in rec["missing"] and extracted.get("company"):
                        updated_fields["Company"] = extracted["company"]
                        updated.append("Company")
                    if "Role" in rec["missing"] and extracted.get("role"):
                        updated_fields["Role"] = extracted["role"]
                        updated.append("Role")
                    if "Comp" in rec["missing"] and extracted.get("comp"):
                        updated_fields["Comp"] = extracted["comp"]
                        updated.append("Comp")

                if not rec.get("source"):
                    updated_fields["Source"] = "Manual"

                if updated_fields:
                    await patch_record_by_id(rec["record_id"], updated_fields)

                done += 1
                yield json.dumps({"type": "progress", "done": done, "total": total, "updated": updated}) + "\n"
            except Exception as e:
                done += 1
                yield json.dumps({"type": "progress", "done": done, "total": total, "updated": [], "error": str(e)[:80]}) + "\n"

        yield json.dumps({"type": "done", "done": done, "total": total}) + "\n"

    return StreamingResponse(generate(), media_type="text/plain")
