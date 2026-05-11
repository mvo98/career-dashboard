from pydantic import BaseModel


class MaterialsRequest(BaseModel):
    company: str
    role: str


class MaterialsResponse(BaseModel):
    resume_summary: str
    cover_letter: str
    jd_signals: list[str]
    emphasis_applied: str
    proof_point_selected: str
