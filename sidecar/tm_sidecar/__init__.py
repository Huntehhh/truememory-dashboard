"""TrueMemory Observatory sidecar.

FastAPI service that imports the real ``truememory`` package for retrieval
simulation, live injection/store events, and curation write-ops. Runs on
loopback (127.0.0.1) behind the dashboard's Express proxy.
"""

from tm_sidecar.app import app

__all__ = ["app"]
