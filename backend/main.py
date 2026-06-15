from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import bcrypt
import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data" / "pitch"
USERS_FILE = DATA_DIR / "users" / "users.json"
SESSIONS_DIR = DATA_DIR / "sessions"
JWT_SECRET = os.environ.get("PITCH_TANK_JWT_SECRET", "pitch-tank-dev-secret-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_TTL_DAYS = 30

app = FastAPI(title="Pitch Tank API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:9600", "http://127.0.0.1:9600", "https://pitch.highspeed-novadelta.de"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_store() -> None:
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        USERS_FILE.write_text("[]\n", encoding="utf-8")


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_users() -> list[dict[str, Any]]:
    ensure_store()
    return read_json(USERS_FILE, [])


def write_users(users: list[dict[str, Any]]) -> None:
    ensure_store()
    write_json(USERS_FILE, users)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "profileId": user["profileId"],
        "profileName": user["profileName"],
        "email": user["email"],
        "createdAt": user["createdAt"],
    }


def create_token(user: dict[str, Any]) -> str:
    expires = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)
    payload = {"sub": user["id"], "profileId": user["profileId"], "exp": expires}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return authorization.removeprefix("Bearer ").strip()


def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = get_bearer_token(authorization)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    user_id = payload.get("sub")
    for user in read_users():
        if user.get("id") == user_id:
            return user
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")


def session_path(created_at: str, session_id: str) -> Path:
    parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    return SESSIONS_DIR / f"{parsed.year:04d}" / f"{parsed.month:02d}" / f"{session_id}.json"


def iter_session_files() -> list[Path]:
    if not SESSIONS_DIR.exists():
        return []
    return sorted(SESSIONS_DIR.glob("*/*/*.json"), reverse=True)


def read_session_file(path: Path) -> dict[str, Any] | None:
    data = read_json(path, None)
    return data if isinstance(data, dict) else None


def find_session(session_id: str, user: dict[str, Any]) -> tuple[Path, dict[str, Any]]:
    for path in iter_session_files():
        session = read_session_file(path)
        if session and session.get("id") == session_id and session.get("userId") == user["id"]:
            return path, session
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    profileName: str = Field(min_length=2)
    profileId: str = Field(min_length=3)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict[str, Any]


class SessionCreate(BaseModel):
    competition: str
    teamA: str
    teamB: str
    focusTeam: str
    focusPerspective: str
    phase: str = ""
    track: str
    trackTitle: str
    sessionName: str
    sessionStartMatchTime: str = "00:00"
    sessionStartTimestamp: str | None = None
    matchTimeCorrectionSeconds: int = 0
    isMatchClockPaused: bool = False
    matchClockPausedSeconds: int | None = None


class ObservationCreate(BaseModel):
    time: str
    optionCount: Literal["1", "2", "3", "4", "5+"]
    bestOption: str
    played: str
    outcome: str
    matchTime: str = "00:00"
    isInteresting: bool = False


class TimelineCorrectionRequest(BaseModel):
    matchTimeCorrectionSeconds: int | None = None
    isMatchClockPaused: bool | None = None
    matchClockPausedSeconds: int | None = None


class SessionStatusRequest(BaseModel):
    status: Literal["completed", "abandoned"]


@app.get("/api/health")
def health() -> dict[str, str]:
    ensure_store()
    return {"status": "ok"}


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(payload: SignupRequest) -> dict[str, Any]:
    users = read_users()
    email = payload.email.strip().lower()
    profile_id = payload.profileId.strip()

    if any(user["email"] == email for user in users):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    if any(user["profileId"] == profile_id for user in users):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile ID already exists")

    user = {
        "id": f"user_{uuid.uuid4().hex}",
        "email": email,
        "profileId": profile_id,
        "profileName": payload.profileName.strip(),
        "passwordHash": hash_password(payload.password),
        "createdAt": now_iso(),
    }
    users.append(user)
    write_users(users)
    return {"token": create_token(user), "user": public_user(user)}


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> dict[str, Any]:
    email = payload.email.strip().lower()
    for user in read_users():
        if user["email"] == email and verify_password(payload.password, user["passwordHash"]):
            return {"token": create_token(user), "user": public_user(user)}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@app.get("/api/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return public_user(user)


@app.post("/api/sessions")
def create_session(payload: SessionCreate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    for existing_path in iter_session_files():
        existing_session = read_session_file(existing_path)
        if existing_session and existing_session.get("userId") == user["id"] and existing_session.get("status", "active") == "active":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active session already exists")

    created_at = now_iso()
    session = {
        "id": f"session_{uuid.uuid4().hex}",
        "userId": user["id"],
        "profileId": user["profileId"],
        "profileName": user["profileName"],
        "competition": payload.competition,
        "teamA": payload.teamA,
        "teamB": payload.teamB,
        "focusTeam": payload.focusTeam,
        "focusPerspective": payload.focusPerspective,
        "phase": payload.phase,
        "track": payload.track,
        "trackTitle": payload.trackTitle,
        "sessionName": payload.sessionName,
        "sessionStartMatchTime": payload.sessionStartMatchTime,
        "sessionStartTimestamp": payload.sessionStartTimestamp or created_at,
        "matchTimeCorrectionSeconds": payload.matchTimeCorrectionSeconds,
        "isMatchClockPaused": payload.isMatchClockPaused,
        "matchClockPausedSeconds": payload.matchClockPausedSeconds,
        "status": "active",
        "endedAt": None,
        "createdAt": created_at,
        "updatedAt": created_at,
        "observations": [],
    }
    write_json(session_path(created_at, session["id"]), session)
    return session


@app.get("/api/sessions")
def list_sessions(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    for path in iter_session_files():
        session = read_session_file(path)
        if session and session.get("userId") == user["id"]:
            sessions.append(session)
    return sorted(sessions, key=lambda item: item.get("updatedAt", ""), reverse=True)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    _, session = find_session(session_id, user)
    return session




@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, str]:
    path, _ = find_session(session_id, user)
    path.unlink()
    return {"status": "deleted", "id": session_id}

@app.patch("/api/sessions/{session_id}/status")
def update_session_status(
    session_id: str,
    payload: SessionStatusRequest,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    path, session = find_session(session_id, user)
    session["status"] = payload.status
    if payload.status == "abandoned":
        session["observations"] = []
    ended_at = now_iso()
    session["endedAt"] = ended_at
    session["updatedAt"] = ended_at
    write_json(path, session)
    return session


@app.patch("/api/sessions/{session_id}/timeline")
def correct_session_timeline(
    session_id: str,
    payload: TimelineCorrectionRequest,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    path, session = find_session(session_id, user)
    if session.get("status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")
    if payload.matchTimeCorrectionSeconds is not None:
        session["matchTimeCorrectionSeconds"] = payload.matchTimeCorrectionSeconds
    if payload.isMatchClockPaused is not None:
        session["isMatchClockPaused"] = payload.isMatchClockPaused
    if payload.matchClockPausedSeconds is not None:
        session["matchClockPausedSeconds"] = max(0, payload.matchClockPausedSeconds)
    elif payload.isMatchClockPaused is False:
        session["matchClockPausedSeconds"] = None
    session["updatedAt"] = now_iso()
    write_json(path, session)
    return session


@app.post("/api/sessions/{session_id}/observations")
def add_observation(
    session_id: str,
    payload: ObservationCreate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    path, session = find_session(session_id, user)
    if session.get("status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")
    observation = {
        "id": f"obs_{uuid.uuid4().hex}",
        "createdAt": now_iso(),
        "time": payload.time,
        "optionCount": payload.optionCount,
        "bestOption": payload.bestOption,
        "played": payload.played,
        "outcome": payload.outcome,
        "matchTime": payload.matchTime,
        "isInteresting": payload.isInteresting,
    }
    session["observations"] = [observation, *session.get("observations", [])]
    session["updatedAt"] = now_iso()
    write_json(path, session)
    return session


@app.patch("/api/sessions/{session_id}/observations/{observation_id}")
def update_observation(
    session_id: str,
    observation_id: str,
    payload: ObservationCreate,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    path, session = find_session(session_id, user)
    if session.get("status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")

    observations = session.get("observations", [])
    for index, observation in enumerate(observations):
        if observation.get("id") == observation_id:
            observations[index] = {
                **observation,
                "updatedAt": now_iso(),
                "time": payload.time,
                "optionCount": payload.optionCount,
                "bestOption": payload.bestOption,
                "played": payload.played,
                "outcome": payload.outcome,
                "matchTime": payload.matchTime,
                "isInteresting": payload.isInteresting,
            }
            session["observations"] = observations
            session["updatedAt"] = now_iso()
            write_json(path, session)
            return session

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation not found")


@app.delete("/api/sessions/{session_id}/observations/{observation_id}")
def delete_observation(
    session_id: str,
    observation_id: str,
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    path, session = find_session(session_id, user)
    if session.get("status", "active") != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")

    observations = session.get("observations", [])
    next_observations = [observation for observation in observations if observation.get("id") != observation_id]
    if len(next_observations) == len(observations):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation not found")

    session["observations"] = next_observations
    session["updatedAt"] = now_iso()
    write_json(path, session)
    return session


if __name__ == "__main__":
    import uvicorn

    ensure_store()
    uvicorn.run(app, host="127.0.0.1", port=9700)
