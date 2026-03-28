import json
import os
import uuid
from datetime import datetime, timezone

from app.db.database import get_connection
from app.db.models import Job, JobStatus


KNOWN_MODULES = {"rfdiffusion_aa", "partial_diffusion", "lanmodulin", "biosar"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _row_to_job(row) -> Job:
    return Job(
        id=row["id"],
        module=row["module"],
        status=JobStatus(row["status"]),
        created_at=row["created_at"],
        parameters=row["parameters"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        error=row["error"],
        output_dir=row["output_dir"],
    )


def create_job(module: str, parameters: dict) -> Job:
    if module not in KNOWN_MODULES:
        raise ValueError(f"Unknown module '{module}'. Known: {sorted(KNOWN_MODULES)}")

    job_id = str(uuid.uuid4())
    output_dir = f"data/jobs/{job_id}/outputs/"
    os.makedirs(output_dir, exist_ok=True)

    job = Job(
        id=job_id,
        module=module,
        status=JobStatus.PENDING,
        created_at=_now(),
        parameters=json.dumps(parameters),
        output_dir=output_dir,
    )

    conn = get_connection()
    conn.execute(
        """INSERT INTO jobs
           (id, module, status, created_at, parameters, output_dir)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (job.id, job.module, job.status, job.created_at, job.parameters, job.output_dir),
    )
    conn.commit()
    conn.close()
    return job


def get_job(job_id: str) -> Job | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    conn.close()
    return _row_to_job(row) if row else None


def list_jobs(status: str | None = None) -> list[Job]:
    conn = get_connection()
    if status:
        rows = conn.execute(
            "SELECT * FROM jobs WHERE status=? ORDER BY created_at DESC", (status,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [_row_to_job(r) for r in rows]


def update_job_status(
    job_id: str,
    status: JobStatus,
    started_at: str | None = None,
    completed_at: str | None = None,
    error: str | None = None,
) -> None:
    conn = get_connection()
    conn.execute(
        """UPDATE jobs SET status=?, started_at=COALESCE(?, started_at),
           completed_at=COALESCE(?, completed_at), error=COALESCE(?, error)
           WHERE id=?""",
        (status, started_at, completed_at, error, job_id),
    )
    conn.commit()
    conn.close()
