"""Lazy Memory() singleton with idle-unload of the cross-encoder.

Design contract:

* The ``truememory.Memory`` engine is built on the FIRST use (never at import
  or app-boot). Boot must stay instant so ``/health`` responds while the DB is
  cold and the model server is still warming.
* Every engine call is serialized under one ``threading.Lock`` — the engine
  guards its SQLite writes with its own ``_write_lock`` but the sidecar can
  fan multiple search calls into it from concurrent requests, and coordinated
  simulate stages (fts + vector + rrf + salience + surprise + rerank) really
  do want a stable snapshot rather than interleaved reads. The lock also
  makes the idle-unload predicate safe.
* Async endpoints call :func:`run_engine` which offloads the callable to a
  threadpool via ``starlette.concurrency.run_in_threadpool`` so the event
  loop keeps serving other requests during a slow first-call warmup.
* A background watchdog thread checks ``last_used`` every 60s; after
  ``CONFIG.idle_unload_seconds`` (default 600s) without engine activity it
  calls ``truememory.reranker.unload_reranker()`` best-effort.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable, TypeVar

from starlette.concurrency import run_in_threadpool

from tm_sidecar.config import CONFIG

T = TypeVar("T")


class EngineHolder:
    """Owns the lazily-constructed Memory() instance and its access lock."""

    def __init__(self) -> None:
        self._memory: Any | None = None
        # One coarse lock for both build + call. Under load the engine has
        # its own finer-grained locks; we hold this only for the duration of
        # a single API-call callable, which keeps stage decomposition
        # consistent without turning every request into a queue.
        self._lock = threading.Lock()
        self._built_at: float | None = None
        self._last_used: float | None = None
        self._watchdog_started = False
        self._watchdog_stop = threading.Event()

    # ------------------------------------------------------------------
    # Construction / access
    # ------------------------------------------------------------------

    def is_loaded(self) -> bool:
        """Non-blocking read used by /health so the endpoint never triggers a build."""
        return self._memory is not None

    def _ensure_built(self) -> Any:
        """Build ``Memory`` on first use. Caller must already hold ``self._lock``."""
        if self._memory is None:
            from truememory import Memory  # heavy import — deferred to first use

            self._memory = Memory(path=str(CONFIG.db_path))
            self._built_at = time.time()
            self._start_watchdog()
        self._last_used = time.time()
        return self._memory

    def get(self) -> Any:
        """Synchronous accessor; builds on first call. Prefer :func:`run_engine`."""
        with self._lock:
            return self._ensure_built()

    # ------------------------------------------------------------------
    # Async offload
    # ------------------------------------------------------------------

    async def run(self, fn: Callable[[Any], T]) -> T:
        """Execute ``fn(engine)`` on a worker thread under the engine lock.

        The lock is acquired inside the worker so the event loop is never
        blocked waiting on the mutex — only the offloaded function is.
        """
        def _invoke() -> T:
            with self._lock:
                mem = self._ensure_built()
                try:
                    return fn(mem)
                finally:
                    self._last_used = time.time()

        return await run_in_threadpool(_invoke)

    # ------------------------------------------------------------------
    # Idle unload watchdog
    # ------------------------------------------------------------------

    def _start_watchdog(self) -> None:
        if self._watchdog_started:
            return
        self._watchdog_started = True
        t = threading.Thread(
            target=self._watchdog_loop,
            name="tm-sidecar-idle-unload",
            daemon=True,
        )
        t.start()

    def _watchdog_loop(self) -> None:
        """Poll every 60s; unload reranker if idle > idle_unload_seconds."""
        interval = 60.0
        while not self._watchdog_stop.wait(interval):
            try:
                self._maybe_unload_idle()
            except Exception:
                # Watchdog must never crash the process.
                pass

    def _maybe_unload_idle(self) -> None:
        idle_cap = CONFIG.idle_unload_seconds
        if idle_cap <= 0:
            return
        last = self._last_used
        if last is None:
            return
        if time.time() - last < idle_cap:
            return
        # Best-effort: import + unload wrapped so a missing reranker module
        # or a stale engine never propagates upward.
        try:
            from truememory.reranker import unload_reranker

            # Predicate re-checks idleness under the reranker's own lock —
            # a concurrent search arriving during the wait cancels the unload.
            def _still_idle() -> bool:
                last_now = self._last_used
                return last_now is None or (time.time() - last_now) >= idle_cap

            unload_reranker(should_unload=_still_idle)
        except Exception:
            pass

    def close(self) -> None:
        """Stop the watchdog. Called from app lifespan shutdown."""
        self._watchdog_stop.set()


HOLDER = EngineHolder()


async def run_engine(fn: Callable[[Any], T]) -> T:
    """Module-level convenience — call ``fn(engine)`` under the engine lock."""
    return await HOLDER.run(fn)
