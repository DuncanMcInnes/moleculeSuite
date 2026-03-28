# Phase 6a — Job Backend Infrastructure

_Status: planned_
_Last updated: 2026-03-09_

---

## Overview

Phase 6a introduces a job queue system to the moleculeSuite API. The goal is
infrastructure only — a SQLite-backed job table, an abstract runner interface,
a job service layer, and four REST endpoints. No actual module execution logic
(RFdiffusionAA, partial diffusion, etc.) is implemented here; those are Phase
6b+. All jobs in 6a will run a stub worker function to exercise the full
lifecycle.

---

## Context: Why This Shape

Reading the four notebook analyses clarifies the design constraints:

| Module | Compute | Runtime | Output |
|---|---|---|---|
| `rfdiffusion_aa` | GPU required | ~1 min/design, 20–30 min batch | PDB files |
| `partial_diffusion` | GPU required | ~0.19 min/design, 10-design batch | PDB files |
| `lanmodulin` | GPU required | ~1–2 min/design, 5-design batch | PDB files |
| `biosar` | CPU only | Seconds to minutes | Ranked sequence list (JSON) |

All four share these requirements:
- Long enough to need background execution (not inline with the HTTP request)
- Multiple jobs must run simultaneously (BioSAR + GPU jobs in parallel)
- Outputs are files, not just a return value
- Need observable status (user polls or frontend subscribes later)

The simplest system that satisfies all four: **SQLite + ThreadPoolExecutor**.
No Redis, no Celery, no message queue — those can be swapped in via the
`JobRunner` interface later if scale demands it.

---

## New Files

```
packages/api/app/db/__init__.py
packages/api/app/db/database.py       # connection pool + init_db()
packages/api/app/db/models.py         # Job dataclass + JobStatus enum

packages/api/app/runners/__init__.py
packages/api/app/runners/base.py      # JobRunner ABC
packages/api/app/runners/local_runner.py  # ThreadPoolExecutor implementation

packages/api/app/services/job_service.py  # CRUD: create/get/list/update
packages/api/app/routers/jobs.py          # FastAPI endpoints
```

**Modified (one file only):**
```
packages/api/app/main.py   # add lifespan handler + include jobs router
```

No existing routers or services are touched.

---

## Data Model

### SQLite Table: `jobs`

```sql
CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,   -- UUID4 string
    module       TEXT NOT NULL,      -- 'rfdiffusion_aa' | 'partial_diffusion'
                                     -- | 'lanmodulin' | 'biosar'
    status       TEXT NOT NULL,      -- see JobStatus below
    created_at   TEXT NOT NULL,      -- ISO 8601 UTC, e.g. '2026-03-09T14:23:00'
    started_at   TEXT,               -- NULL until runner picks it up
    completed_at TEXT,               -- NULL until terminal state
    parameters   TEXT NOT NULL,      -- JSON blob of module-specific params
    error        TEXT,               -- NULL unless status='failed'
    output_dir   TEXT                -- 'data/jobs/{id}/outputs/'
);
```

### JobStatus values

```
pending    — created, waiting in queue
running    — worker thread has started
complete   — finished successfully
failed     — finished with error, or cancelled
```

Cancellation is represented as `failed` with `error="cancelled"`. Running jobs
cannot be forcibly killed (Python threads have no SIGKILL equivalent); cancel
only prevents a pending job from being picked up.

### Python dataclass (app/db/models.py)

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

class JobStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    COMPLETE  = "complete"
    FAILED    = "failed"

@dataclass
class Job:
    id:           str
    module:       str
    status:       JobStatus
    created_at:   str
    parameters:   str          # raw JSON string
    started_at:   Optional[str]   = None
    completed_at: Optional[str]   = None
    error:        Optional[str]   = None
    output_dir:   Optional[str]   = None
```

---

## Module Registry

Known modules (validated at job creation):

```python
KNOWN_MODULES = {
    "rfdiffusion_aa",
    "partial_diffusion",
    "lanmodulin",
    "biosar",
}
```

Unknown module names are rejected with HTTP 422 at creation time. This list
will grow as Phase 6b+ implements actual runners.

---

## Runner Interface

### Abstract base (app/runners/base.py)

```python
from abc import ABC, abstractmethod

class JobRunner(ABC):

    @abstractmethod
    def submit(self, job_id: str, module: str, parameters: dict) -> None:
        """Enqueue a job. Must be non-blocking."""
        ...

    @abstractmethod
    def cancel(self, job_id: str) -> bool:
        """Cancel a pending job. Returns True if cancellation succeeded."""
        ...
```

`status()` is intentionally omitted from the runner — the database is the
single source of truth for status. The runner only writes status transitions
(pending→running, running→complete/failed); readers always query the DB.

### LocalRunner (app/runners/local_runner.py)

```python
from concurrent.futures import ThreadPoolExecutor

class LocalRunner(JobRunner):
    def __init__(self, max_workers: int = 4):
        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._futures: dict[str, Future] = {}   # job_id → Future (for cancel)

    def submit(self, job_id, module, parameters):
        # 1. Set status → running in DB
        # 2. Submit _execute(job_id, module, parameters) to thread pool
        # 3. Store future in self._futures

    def _execute(self, job_id, module, parameters):
        # 1. Record started_at
        # 2. Call module stub (returns output dict or raises)
        # 3. Write outputs to output_dir
        # 4. Set status → complete or failed
        # 5. Record completed_at / error

    def cancel(self, job_id):
        # If future exists and not started: future.cancel() → set failed/cancelled
        # If already running: set error="cancellation requested" but cannot stop
        # Returns True only if actually prevented from running
```

`max_workers=4` default: allows BioSAR (CPU) and a GPU job to run in parallel
during local development. Configurable via env var `JOB_MAX_WORKERS`.

### Future: CeleryRunner

The ABC makes replacement straightforward:

```python
class CeleryRunner(JobRunner):
    def submit(self, job_id, module, parameters):
        celery_app.send_task("jobs.execute", args=[job_id, module, parameters])

    def cancel(self, job_id):
        celery_app.control.revoke(job_id, terminate=True)
```

No changes to the service layer or endpoints needed.

---

## Job Service (app/services/job_service.py)

```python
def create_job(module: str, parameters: dict) -> Job
    # Validates module name
    # Generates UUID id
    # Sets output_dir = f"data/jobs/{id}/outputs/"
    # Creates output_dir on disk
    # Inserts row into DB with status=pending
    # Returns Job

def get_job(job_id: str) -> Job | None
    # SELECT by id; returns None if not found

def list_jobs(status: str | None = None) -> list[Job]
    # SELECT all, optionally filtered by status
    # Ordered by created_at DESC

def update_job_status(
    job_id: str,
    status: JobStatus,
    started_at: str | None = None,
    completed_at: str | None = None,
    error: str | None = None,
) -> None
    # UPDATE jobs SET ... WHERE id = ?
```

The service never touches the runner directly. The router layer calls
`create_job()` then `runner.submit()`. This keeps the service pure (testable
without a runner).

---

## Database Layer (app/db/database.py)

```python
DB_PATH = os.getenv("JOB_DB_PATH", "data/jobs/jobs.db")

def get_connection() -> sqlite3.Connection:
    # Returns a connection with row_factory = sqlite3.Row
    # check_same_thread=False (safe: we use one conn per call, not shared)

def init_db() -> None:
    # Creates data/jobs/ directory if missing
    # Runs CREATE TABLE IF NOT EXISTS jobs (...)
```

SQLite's `check_same_thread=False` is safe here because we are not sharing a
single connection across threads — each call to `get_connection()` opens a new
connection. SQLite handles concurrent writers with its WAL journal mode, which
we enable at init time (`PRAGMA journal_mode=WAL`).

---

## API Endpoints

All responses follow the project envelope: `{ data, error, metadata }`.

### POST /api/jobs — Create and queue a job

**Request body:**
```json
{
  "module": "rfdiffusion_aa",
  "parameters": {
    "input_pdb": "1abc.pdb",
    "num_designs": 20,
    "contig_string": "1-3,A4-63,4-6,A74-98"
  }
}
```

**Response 201:**
```json
{
  "data": {
    "id": "a3f7c2d1-...",
    "module": "rfdiffusion_aa",
    "status": "pending",
    "created_at": "2026-03-09T14:23:00",
    "started_at": null,
    "completed_at": null,
    "parameters": { "..." },
    "error": null,
    "output_dir": "data/jobs/a3f7c2d1-.../outputs/"
  },
  "error": null,
  "metadata": {}
}
```

**Error 422** if module is not in `KNOWN_MODULES`.

---

### GET /api/jobs — List all jobs

**Query params:** `?status=pending` (optional)

**Response 200:**
```json
{
  "data": [ { ... }, { ... } ],
  "error": null,
  "metadata": { "total": 2 }
}
```

---

### GET /api/jobs/{id} — Get single job

**Response 200:**
```json
{
  "data": {
    "id": "a3f7c2d1-...",
    "status": "running",
    "started_at": "2026-03-09T14:23:05",
    ...
  },
  "error": null,
  "metadata": {}
}
```

**Error 404** if job not found.

---

### DELETE /api/jobs/{id} — Cancel a job

**Response 200:**
```json
{
  "data": { "cancelled": true, "note": "Job was pending and will not run." },
  "error": null,
  "metadata": {}
}
```

If job is already `running`, returns:
```json
{
  "data": {
    "cancelled": false,
    "note": "Job is already running. Cancellation requested but thread cannot be stopped."
  },
  "error": null,
  "metadata": {}
}
```

**Error 404** if job not found. **Error 409** if job is already `complete` or
`failed`.

---

## Changes to main.py

Add a FastAPI `lifespan` context manager (the modern pattern, replacing
deprecated `@app.on_event("startup")`):

```python
from contextlib import asynccontextmanager
from app.db.database import init_db
from app.runners.local_runner import LocalRunner
from app.routers import structures, jobs as jobs_router

runner = LocalRunner(max_workers=int(os.getenv("JOB_MAX_WORKERS", "4")))

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    runner._pool.shutdown(wait=False)

app = FastAPI(..., lifespan=lifespan)
app.include_router(jobs_router.router)   # adds prefix /jobs, tag "jobs"
```

The `runner` instance is passed into the jobs router via dependency injection
(FastAPI `Depends`) so it is testable and replaceable.

---

## Directory Layout After Phase 6a

```
packages/api/
  app/
    db/
      __init__.py
      database.py          # get_connection(), init_db()
      models.py            # Job dataclass, JobStatus enum
    runners/
      __init__.py
      base.py              # JobRunner ABC
      local_runner.py      # ThreadPoolExecutor implementation
    services/
      pdb_service.py       # (unchanged)
      job_service.py       # NEW: create/get/list/update
    routers/
      structures.py        # (unchanged)
      jobs.py              # NEW: POST/GET/DELETE endpoints
    main.py                # MODIFIED: lifespan + include jobs router

data/
  jobs/
    jobs.db                # SQLite file (created at startup)
    {job_id}/
      outputs/             # created per job
```

---

## Out of Scope for Phase 6a

- Actual module execution (RFdiffusionAA, LigandMPNN, ESMFold calls) — Phase 6b+
- Frontend job UI (polling, status table) — Phase 6c
- Output file download endpoints — Phase 6b
- WebSocket / Server-Sent Events for live status — future
- Authentication / job ownership — future
- Celery/Redis migration — triggered by scale need, not now

---

## Open Questions (decide before coding)

1. **Runner singleton scope:** Should `LocalRunner` be a module-level singleton
   in `main.py`, or injected via FastAPI's dependency system? Recommendation:
   module-level singleton created in `main.py`, passed to the router via a
   getter dependency (`Depends(get_runner)`). This avoids global state while
   remaining testable.

2. **DB path in Docker:** `data/jobs/jobs.db` assumes the Docker volume mounts
   `data/` into the container. Confirm `docker-compose.yml` mounts `./data`
   before implementation.

3. **WAL mode:** Enabling `PRAGMA journal_mode=WAL` allows concurrent reads
   during writes (important for polling while a job runs). Agree to enable?
   Recommendation: yes, minimal downside.

4. **parameters validation:** Should the API validate parameter keys per module,
   or accept any JSON object? Recommendation: accept any JSON object in 6a
   (module-specific validation arrives with the actual module implementations
   in 6b+).
