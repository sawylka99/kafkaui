"""Desktop FastAPI app: reuses backend API and serves the built React UI."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_ROOT = Path(__file__).resolve().parent
_BACKEND = _ROOT.parent / "backend"
_configured = False


def _ensure_backend_on_path() -> None:
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", _ROOT))
        for candidate in (meipass / "backend", _ROOT / "backend", _BACKEND):
            if candidate.is_dir() and str(candidate) not in sys.path:
                sys.path.insert(0, str(candidate))
                return
    if str(_BACKEND) not in sys.path:
        sys.path.insert(0, str(_BACKEND))


def ui_dir() -> Path:
    """Resolve the directory with the production Vite build."""
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
        for candidate in (
            meipass / "ui",
            Path(sys.executable).parent / "ui",
            Path(sys.executable).parent / "_internal" / "ui",
        ):
            if (candidate / "index.html").is_file():
                return candidate
    local = _ROOT / "ui"
    if (local / "index.html").is_file():
        return local
    raise FileNotFoundError(
        "Built UI not found. Run desktop/build.ps1 "
        "(or: cd frontend && npm run build, then copy dist to desktop/ui)."
    )


def create_app() -> FastAPI:
    """Attach static UI routes to the shared backend FastAPI app (once)."""
    global _configured
    _ensure_backend_on_path()
    from app.main import app as api_app

    if _configured:
        return api_app

    static_root = ui_dir()
    assets = static_root / "assets"
    if assets.is_dir():
        api_app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @api_app.get("/")
    async def spa_index() -> FileResponse:
        return FileResponse(static_root / "index.html")

    @api_app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        candidate = static_root / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(static_root / "index.html")

    _configured = True
    return api_app
