from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .assistant import (
    COMMON_TAP_DRILLS,
    RESPONSE_TEMPLATES,
    build_assistant_response,
    get_categories,
    search_index,
)
from .database import DB_PATH, MATERIAL_SFM, REFERENCE_SOURCES, get_connection, init_db

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
REFERENCE_DIR = BASE_DIR.parent / "reference"
HANDBOOK_PDF = REFERENCE_DIR / "machinery-handbook-27th.pdf"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(DB_PATH)
    yield


app = FastAPI(
    title="ChipMate",
    version="0.3.0",
    description="Offline-first machining assistant for shop questions, formulas, references, and local calculation helpers.",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class AssistantRequest(BaseModel):
    message: str = Field(default="", max_length=1200)
    context: str = Field(default="", max_length=240)
    state: dict[str, Any] = Field(default_factory=dict)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manifest.webmanifest")
def manifest() -> FileResponse:
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/service-worker.js")
def service_worker() -> FileResponse:
    return FileResponse(STATIC_DIR / "service-worker.js", media_type="application/javascript")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.3.0"}


@app.get("/api/categories")
def categories() -> dict[str, list[dict[str, str]]]:
    return {"categories": get_categories()}


@app.get("/api/offline/quick-reference")
def offline_quick_reference() -> dict[str, Any]:
    return {
        "version": "0.3.0",
        "categories": get_categories(),
        "materials": MATERIAL_SFM,
        "common_tap_drills": COMMON_TAP_DRILLS,
        "formulas": {
            slug: template["formulas"]
            for slug, template in RESPONSE_TEMPLATES.items()
            if template["formulas"]
        },
        "sources": REFERENCE_SOURCES,
    }


@app.post("/api/assistant")
def assistant(request: AssistantRequest) -> dict[str, Any]:
    with get_connection(DB_PATH) as conn:
        try:
            return build_assistant_response(conn, request.message, request.state, request.context)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/search")
def search(q: str = Query(default="", max_length=120), limit: int = Query(default=10, ge=1, le=25)):
    with get_connection(DB_PATH) as conn:
        return {"query": q, "results": search_index(conn, q, limit)}


@app.get("/api/sources")
def sources() -> dict[str, list[dict[str, Any]]]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT id, slug, title, publisher, url, note, is_placeholder, created_at
            FROM sources
            ORDER BY id
            """
        ).fetchall()
    return {
        "sources": [
            {
                "id": row["id"],
                "slug": row["slug"],
                "title": row["title"],
                "publisher": row["publisher"],
                "url": row["url"],
                "note": row["note"],
                "is_placeholder": bool(row["is_placeholder"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@app.get("/reference/machinery-handbook-27th.pdf")
def machinery_handbook() -> FileResponse:
    if not HANDBOOK_PDF.is_file():
        raise HTTPException(status_code=404, detail="Machinery's Handbook PDF is not installed locally.")
    return FileResponse(
        HANDBOOK_PDF,
        media_type="application/pdf",
        filename=HANDBOOK_PDF.name,
        headers={"Cache-Control": "no-store"},
    )
