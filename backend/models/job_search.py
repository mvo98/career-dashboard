from pydantic import BaseModel
from typing import Optional


class JobSearchRequest(BaseModel):
    titles: list[str]
    location: str = "San Diego, CA"
    salary_floor: int = 85000


class JobResult(BaseModel):
    id: str
    title: str
    company: str
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_display: str
    location: str
    description: str
    url: str
    source: str
    flags: list[str]


class FilterReason(BaseModel):
    label: str
    count: int


class JobSearchResponse(BaseModel):
    jobs: list[JobResult]
    total: int
    filtered_count: int
    filter_breakdown: list[FilterReason]


class FetchDescriptionRequest(BaseModel):
    url: str


class FetchDescriptionResponse(BaseModel):
    description: str
    full: bool
