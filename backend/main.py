from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import job_fit, job_search, airtable

app = FastAPI(title="Career Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(job_fit.router, prefix="/api")
app.include_router(job_search.router, prefix="/api")
app.include_router(airtable.router, prefix="/api")
