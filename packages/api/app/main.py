import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.routers import structures
from app.routers import jobs as jobs_router
from app.runners.local_runner import LocalRunner

runner = LocalRunner(
    max_workers=int(os.getenv("JOB_MAX_WORKERS", "4"))
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    jobs_router.set_runner(runner)
    yield
    runner._pool.shutdown(wait=False)

app = FastAPI(
    title="moleculeSuite API",
    description="Protein biochemistry visualisation backend",
    version="0.1.0",
    lifespan=lifespan,
)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(structures.router)
app.include_router(jobs_router.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict:
    return {"message": "moleculeSuite API", "docs": "/docs"}
