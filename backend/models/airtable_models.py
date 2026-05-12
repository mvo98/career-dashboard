from pydantic import BaseModel
from typing import Optional, Any


class SaveEvaluationRequest(BaseModel):
    company: str = ""
    role: str = ""
    fit_score: int
    comp: str = ""
    action: str
    rationale: str
    dimensions: dict[str, Any]
    full_jd: str
    url: str = ""
    source: str = ""


class SaveEvaluationResponse(BaseModel):
    record_id: Optional[str] = None
    created: bool


class LookupRole(BaseModel):
    company: str
    title: str


class LookupRequest(BaseModel):
    roles: list[LookupRole]


class AirtableMatch(BaseModel):
    fit_score: Optional[int] = None
    status: Optional[str] = None
    action: Optional[str] = None


class LookupResponse(BaseModel):
    matches: dict[str, AirtableMatch]


class DismissRequest(BaseModel):
    company: str
    role: str
    url: str = ""
    source: str = ""


class DismissResponse(BaseModel):
    record_id: Optional[str] = None
    created: bool


class RoleListItem(BaseModel):
    company: str
    role: str
    fit_score: Optional[int] = None
    status: Optional[str] = None
    action: Optional[str] = None
    date_evaluated: Optional[str] = None
    materials_generated: bool = False
    notes: str = ""


class RolesListResponse(BaseModel):
    roles: list[RoleListItem]


class UpdateRoleRequest(BaseModel):
    company: str
    role: str
    status: Optional[str] = None
    notes: Optional[str] = None


class UpdateRoleResponse(BaseModel):
    record_id: Optional[str] = None
    updated: bool


class FollowUpRole(BaseModel):
    company: str
    role: str
    date_applied: str
    fit_score: Optional[int] = None
    posting_url: Optional[str] = None


class DashboardResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    avg_fit_applied: Optional[int] = None
    follow_up_needed: list[FollowUpRole]
