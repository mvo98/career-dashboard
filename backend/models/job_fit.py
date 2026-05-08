from pydantic import BaseModel
from typing import Optional


class JobFitRequest(BaseModel):
    job_description: str


class DimensionScore(BaseModel):
    score: int
    weight: float
    reason: str


class JobFitResponse(BaseModel):
    overall_score: int
    action: str  # "Apply", "Explore", "Skip"
    action_justification: str
    hard_skip_triggered: bool
    hard_skip_reason: Optional[str]
    dimensions: dict[str, DimensionScore]
    talking_points: list[str]
