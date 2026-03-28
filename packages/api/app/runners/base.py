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
