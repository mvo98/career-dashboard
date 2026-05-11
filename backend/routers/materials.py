import asyncio
from fastapi import APIRouter, HTTPException
from models.materials import MaterialsRequest, MaterialsResponse
from services.airtable import fetch_role_data, save_materials_generated
from services.materials import generate_materials

router = APIRouter()


@router.post("/materials/generate", response_model=MaterialsResponse)
async def generate(req: MaterialsRequest):
    try:
        role_data = await fetch_role_data(req.company, req.role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Airtable fetch failed: {e}")

    if not role_data:
        raise HTTPException(
            status_code=404,
            detail=f"No Airtable record found for {req.company} / {req.role}",
        )
    if not role_data.get("full_jd"):
        raise HTTPException(
            status_code=422,
            detail="Full JD not saved for this role — re-evaluate it first so the JD is stored.",
        )

    try:
        result = await asyncio.to_thread(
            generate_materials,
            company=req.company,
            role=req.role,
            full_jd=role_data["full_jd"],
            evaluation=role_data,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    try:
        await save_materials_generated(req.company, req.role)
    except Exception:
        pass  # non-critical — don't fail the whole request over the save

    return MaterialsResponse(**result)
