import json
import os
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone

from app.db.database import get_connection
from app.db.models import JobStatus
from app.runners.base import JobRunner


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _stub_worker(job_id: str, module: str, parameters: dict, output_dir: str) -> dict:
    """Stub: sleeps 5 s then writes stub_output.json."""
    import time
    time.sleep(5)
    result = {"job_id": job_id, "module": module, "stub": True}
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "stub_output.json"), "w") as f:
        json.dump(result, f)
    return result


class LocalRunner(JobRunner):

    def __init__(self, max_workers: int = 4):
        self._pool = ThreadPoolExecutor(max_workers=max_workers)
        self._futures: dict[str, Future] = {}

    def submit(self, job_id: str, module: str, parameters: dict) -> None:
        future = self._pool.submit(self._execute, job_id, module, parameters)
        self._futures[job_id] = future

    def _execute(self, job_id: str, module: str, parameters: dict) -> None:
        conn = get_connection()
        try:
            conn.execute(
                "UPDATE jobs SET status=?, started_at=? WHERE id=?",
                (JobStatus.RUNNING, _now(), job_id),
            )
            conn.commit()

            row = conn.execute(
                "SELECT output_dir FROM jobs WHERE id=?", (job_id,)
            ).fetchone()
            output_dir = row["output_dir"]

            _stub_worker(job_id, module, parameters, output_dir)

            conn.execute(
                "UPDATE jobs SET status=?, completed_at=? WHERE id=?",
                (JobStatus.COMPLETE, _now(), job_id),
            )
            conn.commit()
        except Exception as exc:
            conn.execute(
                "UPDATE jobs SET status=?, completed_at=?, error=? WHERE id=?",
                (JobStatus.FAILED, _now(), str(exc), job_id),
            )
            conn.commit()
        finally:
            conn.close()
            self._futures.pop(job_id, None)

    def cancel(self, job_id: str) -> bool:
        future = self._futures.get(job_id)
        if future is None:
            return False
        cancelled = future.cancel()
        if cancelled:
            conn = get_connection()
            conn.execute(
                "UPDATE jobs SET status=?, completed_at=?, error=? WHERE id=?",
                (JobStatus.FAILED, _now(), "cancelled", job_id),
            )
            conn.commit()
            conn.close()
            self._futures.pop(job_id, None)
        return cancelled
