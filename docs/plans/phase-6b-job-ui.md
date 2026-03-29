# Phase 6b — Job UI Frontend

## Context

Phase 6a delivered a SQLite-backed job queue with four REST endpoints
(`POST/GET/DELETE /api/jobs`). Phase 6b makes those endpoints visible and
usable through the browser: a jobs panel with a submission form, live-polling
status list, and a detail view with output file listing.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `packages/api/app/routers/jobs.py` | Add `GET /api/jobs/{id}/outputs` endpoint |
| `packages/web/src/types.ts` | Add `Job` interface |
| `packages/web/src/index.css` | Add all new CSS classes |
| `packages/web/src/components/JobsPanel.tsx` | New component (main work) |
| `packages/web/src/App.tsx` | Add view toggle + render `<JobsPanel />` |

Also save this plan to `docs/plans/phase-6b-job-ui.md` (first implementation step).

---

## Backend Addition

Add to `packages/api/app/routers/jobs.py` (also add `import os` at top):

```python
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
```

---

## New Type — types.ts

```typescript
export interface Job {
  id: string;
  module: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  parameters: Record<string, unknown>;
  error: string | null;
  output_dir: string | null;
}
```

---

## Component: JobsPanel.tsx

Self-contained. App.tsx only needs to mount it — no props required.

### Internal State

| State var | Type | Purpose |
|-----------|------|---------|
| `jobs` | `Job[]` | Full list, updated by polling |
| `selectedJobId` | `string \| null` | null=list view, set=detail view |
| `showForm` | `boolean` | Toggles submit form visibility |
| `module` | `string` | Form: selected module |
| `params` | `string` | Form: JSON textarea value |
| `paramsError` | `string \| null` | JSON parse validation |
| `submitLoading` | `boolean` | POST in flight |
| `submitError` | `string \| null` | POST error message |
| `outputs` | `string[]` | Files from GET /{id}/outputs (detail only) |

### Sub-views (conditional render, not separate components)

- **List view** (`selectedJobId === null`): job table + submit form
- **Detail view** (`selectedJobId !== null`): all fields, outputs, cancel button

### Polling Logic

```typescript
useEffect(() => {
  fetchJobs();  // fetch on mount
}, []);

useEffect(() => {
  const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'running');
  if (!hasActive) return;
  const id = setInterval(fetchJobs, 3000);
  return () => clearInterval(id);
}, [jobs]);
```

The second effect re-runs on every `jobs` update. When all jobs are terminal
it returns early; otherwise it creates a 3s interval and cleans up on the
next run. This guarantees polling stops as soon as the last job settles.

### Duration Calculation Helper

```typescript
function calcDuration(job: Job): string {
  if (!job.started_at) return '—';
  const start = new Date(job.started_at + 'Z').getTime();
  const end = job.completed_at
    ? new Date(job.completed_at + 'Z').getTime()
    : Date.now();
  const secs = Math.floor((end - start) / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
```

### API Calls

| Action | Method | Endpoint | Triggered by |
|--------|--------|----------|--------------|
| Load list | GET | /api/jobs | On mount + polling interval |
| Create job | POST | /api/jobs | Form submit button |
| Cancel job | DELETE | /api/jobs/{id} | Detail view cancel button |
| List outputs | GET | /api/jobs/{id}/outputs | Detail view, status=complete |

### JSON Parameter Validation

Before POST, attempt `JSON.parse(params)`. If it throws, set `paramsError`
and abort. Reset `paramsError` to null on every keystroke.

### Form: Module Selector

Hardcoded `<select>` options matching `KNOWN_MODULES`:
`biosar`, `rfdiffusion_aa`, `partial_diffusion`, `lanmodulin`
(default: `biosar`)

---

## View Toggle — App.tsx

Add `activeView: 'structure' | 'jobs'` state (default `'structure'`).

Tab bar goes in `.app-header`, using existing `.repr-btn` / `.repr-btn--active`
CSS classes (reuse — no new tab-specific classes needed):

```
┌──────────────────────────────────────────────────┐
│  moleculeSuite API  [Structure] [Jobs]            │  ← app-header
├─────────────┬────────────────────────────────────┤
│             │                                    │
│  sidebar    │  structure viewer                  │
│  panels     │  OR                                │
│             │  jobs panel (full width)           │
└─────────────┴────────────────────────────────────┘
```

When `activeView === 'jobs'`: hide sidebar + viewer with `display: none` (not
unmount — preserves Mol* plugin state), render `<JobsPanel />` taking full
`.app-main` width.

---

## CSS Additions — index.css

All use existing CSS variables. New classes:

```css
/* Jobs panel layout */
.jobs-panel            /* full-height flex column */
.jobs-panel__header    /* title + "New Job" button row */
.jobs-panel__body      /* scrollable, padding */

/* Submit form */
.job-form              /* surface-2 box, stacked rows */
.job-form__row         /* label + input pair */
.job-form__textarea    /* monospace JSON input */
.job-form__error       /* --danger colour, small text */

/* Job table */
.job-table             /* full-width, border-collapse */
.job-row               /* cursor: pointer, hover: surface-2 bg */

/* Status badge */
.job-badge             /* inline-block pill, small text, radius */
.job-badge--pending    /* color: --text-muted */
.job-badge--running    /* color: #e3b341 (amber) */
.job-badge--complete   /* color: #3fb950 (green) */
.job-badge--failed     /* color: var(--danger) */

/* Detail view */
.job-detail            /* stacked layout, padding */
.job-detail__back      /* text link style, no underline */
.job-detail__field     /* label (muted) + value row */
.job-detail__outputs   /* monospace list of filenames */
```

---

## Build Order (one file at a time, diff before save)

1. `packages/api/app/routers/jobs.py` — add outputs endpoint + `import os`
2. `docs/plans/phase-6b-job-ui.md` — save this plan to the repo
3. `packages/web/src/types.ts` — add `Job` interface
4. `packages/web/src/index.css` — add new CSS classes
5. `packages/web/src/components/JobsPanel.tsx` — new component
6. `packages/web/src/App.tsx` — view toggle + render `<JobsPanel />`

---

## Verification

```bash
docker compose up -d

# 1. Jobs tab appears in header at localhost:5173
# 2. Submit module=biosar, parameters={}
#    → row appears: pending → running → complete within ~10s
# 3. Click row → detail view: timestamps, parameters, output_dir shown
# 4. Output files section shows stub_output.json when complete
# 5. Submit another job, cancel immediately
#    → status=failed, error=cancelled in detail view
# 6. When all jobs terminal: no /api/jobs requests in browser network tab
# 7. Switch to Structure tab → Mol* viewer unchanged
```
