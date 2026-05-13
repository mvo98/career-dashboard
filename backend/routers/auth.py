import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from jose import jwt

router = APIRouter()

_ALGORITHM = "HS256"
_EXPIRE_DAYS = 30


class LoginRequest(BaseModel):
    password: str


@router.post("/auth")
async def login(req: LoginRequest):
    secret = os.environ.get("APP_SECRET", "")
    if not secret or req.password != secret:
        return JSONResponse(status_code=401, content={"detail": "Invalid password"})
    payload = {
        "sub": "mauricio",
        "exp": datetime.now(timezone.utc) + timedelta(days=_EXPIRE_DAYS),
    }
    token = jwt.encode(payload, secret, algorithm=_ALGORITHM)
    return {"token": token}
