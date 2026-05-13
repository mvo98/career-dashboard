from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from routers import job_fit, job_search, airtable, materials, auth

app = FastAPI(title="Career Dashboard API")

_APP_SECRET = os.environ.get("APP_SECRET", "")
_ALGORITHM = "HS256"
_PUBLIC_PATHS = {"/api/auth"}


@app.middleware("http")
async def require_auth(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in _PUBLIC_PATHS:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    token = auth_header[7:]
    try:
        jwt.decode(token, _APP_SECRET, algorithms=[_ALGORITHM])
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "Invalid token"})

    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(job_fit.router, prefix="/api")
app.include_router(job_search.router, prefix="/api")
app.include_router(airtable.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
