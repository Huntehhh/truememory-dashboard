"""FastAPI app factory for the Observatory sidecar.

Boots cheap: no engine construction at import or lifespan startup so the
uvicorn process is ready to answer /health within milliseconds. The heavy
``truememory.Memory`` build is deferred to the first /simulate or /curation
call via ``engine_holder.HOLDER``.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version as pkg_version

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from tm_sidecar.config import CONFIG
from tm_sidecar.curation import router as curation_router
from tm_sidecar.directives import router as directives_router
from tm_sidecar.engine_holder import HOLDER
from tm_sidecar.events import router as events_router
from tm_sidecar.simulate import router as simulate_router

_BOOT_TS = time.time()


def _tm_version() -> str:
    try:
        return pkg_version("truememory")
    except PackageNotFoundError:  # pragma: no cover — dev-editable install always present
        return "unknown"


@asynccontextmanager
async def lifespan(_: FastAPI):
    """No-op startup (never load models here); tear down the watchdog on exit."""
    try:
        yield
    finally:
        HOLDER.close()


app = FastAPI(title="TrueMemory Observatory Sidecar", lifespan=lifespan)


@app.exception_handler(Exception)
async def _json_error_handler(_: Request, exc: Exception) -> JSONResponse:
    """Every uncaught exception becomes a structured JSON envelope.

    Kept intentionally minimal — the sidecar sits behind a same-host proxy
    that surfaces upstream errors verbatim, so trace-style detail here is
    fine for debugging without leaking to a public surface.
    """
    return JSONResponse(
        status_code=500,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc),
        },
    )


@app.get("/health")
def health() -> dict:
    """Instant, engine-free liveness probe.

    Consumed by the dashboard's /api/meta/status aggregator with a 1s
    timeout. MUST NOT touch the engine — a cold Memory() build takes
    several seconds and would break the meta probe.
    """
    return {
        "ok": True,
        "tm_version": _tm_version(),
        "db_path": str(CONFIG.db_path),
        "engine_loaded": HOLDER.is_loaded(),
        "uptime_s": round(time.time() - _BOOT_TS, 3),
    }


app.include_router(simulate_router)
app.include_router(events_router)
app.include_router(curation_router)
app.include_router(directives_router)
