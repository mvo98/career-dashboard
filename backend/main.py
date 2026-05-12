from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from routers import job_fit, job_search, airtable, materials

app = FastAPI(title="Career Dashboard API")

_APP_SECRET = os.environ.get("APP_SECRET", "")


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    key = request.headers.get("x-api-key", "")
    if not _APP_SECRET or key != _APP_SECRET:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(job_fit.router, prefix="/api")
app.include_router(job_search.router, prefix="/api")
app.include_router(airtable.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
