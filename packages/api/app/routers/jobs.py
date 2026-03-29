import json
import os
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.db.models import JobStatus
from app.runners.base import JobRunner
from app.services import job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])

# --- dependency ---

_runner: JobRunner | None = None

def set_runner(r: JobRunner) -> None:
    global _runner
    _runner = r

def get_runner() -> JobRunner:
    if _runner is None:
        raise RuntimeError("Runner not initialised")
    return _runner

# --- request schema ---

class CreateJobRequest(BaseModel):
    module: str
    parameters: dict = {}

# --- helpers ---

def job_to_dict(job) -> dict:
    d = asdict(job)
    d["parameters"] = json.loads(job.parameters)
    d["status"] = job.status.value
    return d

# --- endpoints ---

@router.post("", status_code=201)
async def create_job(body: CreateJobRequest, runner: JobRunner = Depends(get_runner)):
    try:
        job = job_service.create_job(body.module, body.parameters)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    runner.submit(job.id, job.module, json.loads(job.parameters))
    return {"data": job_to_dict(job), "error": None, "metadata": {}}


@router.get("")
async def list_jobs(status: str | None = Query(default=None)):
    jobs = job_service.list_jobs(status=status)
    return {"data": [job_to_dict(j) for j in jobs], "error": None, "metadata": {"total": len(jobs)}}


@router.get("/{job_id}")
async def get_job(job_id: str):
    job = job_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"data": job_to_dict(job), "error": None, "metadata": {}}


@router.delete("/{job_id}")
async def cancel_job(job_id: str, runner: JobRunner = Depends(get_runner)):
    job = job_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in (JobStatus.COMPLETE, JobStatus.FAILED):
        raise HTTPException(status_code=409, detail=f"Job is already {job.status.value}")

    cancelled = runner.cancel(job_id)
    if cancelled:
        note = "Job was pending and will not run."
    else:
        note = "Job is already running. Cancellation requested but thread cannot be stopped."
    return {"data": {"cancelled": cancelled, "note": note}, "error": None, "metadata": {}}


@router.get("/{job_id}/outputs")
async def list_outputs(job_id: str):
    job = job_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    output_dir = job.output_dir or ""
    if not os.path.isdir(output_dir):
        return {"data": [], "error": None, "metadata": {}}
    files = sorted(os.listdir(output_dir))
    return {"data": files, "error": None, "metadata": {"count": len(files)}}
