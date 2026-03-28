from dataclasses import dataclass
from enum import Enum
from typing import Optional


class JobStatus(str, Enum):
    PENDING  = "pending"
    RUNNING  = "running"
    COMPLETE = "complete"
    FAILED   = "failed"


@dataclass
class Job:
    id:           str
    module:       str
    status:       JobStatus
    created_at:   str
    parameters:   str              # raw JSON string
    started_at:   Optional[str] = None
    completed_at: Optional[str] = None
    error:        Optional[str] = None
    output_dir:   Optional[str] = None
