from pydantic import BaseModel


class JobFitRequest(BaseModel):
    job_description: str


class JobFitResponse(BaseModel):
    fit_score: int
    strengths: list[str]
    gaps: list[str]
    talking_points: list[str]
