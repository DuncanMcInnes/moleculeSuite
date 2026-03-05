# moleculeSuite

_Last updated: 2026-03-05_
A protein biochemistry visualisation and analysis suite.
Local-first, containerised, designed to scale to cloud over time.

## Stack

### Backend
- Python 3.11 / FastAPI
- BioPython — PDB parsing and structure manipulation
- MDAnalysis — trajectory analysis (future)
- Docker / uvicorn

### Frontend
- React / TypeScript / Vite
- Mol* (Molstar) — 3D molecular visualisation
- Communicates with backend via REST

### Infrastructure
- Docker Compose for local orchestration
- Target cloud: AWS ECS or GCP Cloud Run (later)

## Project Structure

packages/api/          # FastAPI backend
  app/main.py          # FastAPI app, CORS, router registration
  app/routers/         # Route handlers
  app/services/        # Business logic (BioPython etc)
  Dockerfile
  requirements.txt

packages/web/          # React / TypeScript / Vite frontend
  src/components/      # MolstarViewer, PDBUpload
  src/types.ts         # Shared TypeScript types
  Dockerfile
  vite.config.ts

data/structures/       # Local PDB file storage (mounted as Docker volume)

## Ports
- Backend:  http://localhost:8000
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs

## Current Phase
MVP — Phase 1
- PDB file upload via frontend
- BioPython parses and returns metadata
- Mol* renders the structure

## Planned Phases
- Phase 2: Sequence viewer, chain/residue analysis, B-factor visualisation
- Phase 3: MDAnalysis integration, trajectory playback
- Phase 4: RFdiffusion pipeline integration
- Phase 5: Cloud deployment

## Conventions
- Backend routes use snake_case
- Frontend components use PascalCase
- All new features should be containerised from day one
- API responses follow { data, error, metadata } envelope pattern

## Plans & Decisions
- docs/plans/ — phase plans and architectural decisions
- Current active plan: docs/plans/phase-1-pdb-upload-molstar.md

## Architecture Decisions
- PDB bytes served via blob URL (Phase 1 only — browser session)
- Phase 2 will add server-side PDB persistence via data/structures volume
- Mol* PluginContext uses two-effect pattern: init on mount, reload on file change
- Backend is complete for Phase 1 — no new endpoints needed

## Known Issues / Watch Points
- Molstar emits createRoot + Symbol warnings in dev/StrictMode — 
  entire stack is Molstar internals (renderReact18 → createRoot).
  Not our code. Cosmetic only, won't appear in production build.

## Local Dev Commands
- Start: `docker compose up -d`
- Logs:  `docker compose logs -f api`
- Stop:  `docker compose down`