# moleculeSuite

_Last updated: 2026-03-28_
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
- Phase 6a complete. Phase 6b (job UI frontend) not yet planned.
- Phase 6a — Job backend infrastructure
  - SQLite-backed job table (WAL mode), LocalRunner (ThreadPoolExecutor)
  - Job service: create/get/list/update with KNOWN_MODULES validation
  - REST endpoints: POST /api/jobs, GET /api/jobs, GET /api/jobs/{id}, DELETE /api/jobs/{id}
  - Stub worker exercises full pending→running→complete lifecycle (sleep 5s, writes stub_output.json)
- Phase 5 complete — RCSB fetch by accession code
- Phase 4 complete — HETATM controls: hide/show waters, highlight ligands
- Phase 3 complete
- Phase 2 complete
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
- Completed: docs/plans/phase-6a-job-backend.md
- Completed: docs/plans/phase-5-rcsb-fetch.md
- Completed: docs/plans/phase-4-hetatm-controls.md
- Completed: docs/plans/phase-1-pdb-upload-molstar.md
- Completed: docs/plans/phase-2-metadata-representations-colours.md
- Completed: docs/plans/phase-3-residue-selection.md


## Architecture Decisions
- PDB bytes served via blob URL (Phase 1 only — browser session)
- Phase 2 will add server-side PDB persistence via data/structures volume
- Mol* PluginContext uses two-effect pattern: init on mount, reload on file change
- Backend is complete for Phase 1 — no new endpoints needed
- Mol* native UI hidden via regionState in createPluginUI spec
- chains type is { id, sequence }[] not string[] — carries 
  sequence data from backend through to frontend
- Mol* repr strings: gaussian-surface (not surface), 
  uncertainty (not b-factor)
- applyPreset avoided — manual build chain used for 
  full control over repr and colour
- SequenceCard lives in App.tsx not PDBUpload — 
  display component, not part of upload widget
- auth_seq_id/auth_asym_id always used for Mol* queries — 
  never label_ variants
- Mol* component tags are Arrays not Sets — use 
  Array.includes() not Set.has()
- Full tag string is 'structure-component-static-polymer' 
  not 'static-polymer'

## Known Issues / Watch Points
- Molstar emits createRoot + Symbol warnings in dev/StrictMode — 
  entire stack is Molstar internals (renderReact18 → createRoot).
  Not our code. Cosmetic only, won't appear in production build.

## Local Dev Commands
- Start: `docker compose up -d`
- Logs:  `docker compose logs -f api`
- Stop:  `docker compose down`