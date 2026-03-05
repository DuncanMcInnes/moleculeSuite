import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import structures

app = FastAPI(
    title="moleculeSuite API",
    description="Protein biochemistry visualisation backend",
    version="0.1.0",
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


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict:
    return {"message": "moleculeSuite API", "docs": "/docs"}
