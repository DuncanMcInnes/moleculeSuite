
# Phase 5 Plan: RCSB Fetch by Accession Code

## Goal

Add a text input in the left panel where the user types a 4-character PDB
accession code (e.g. `1HHO`) and presses Enter or a Fetch button. moleculeSuite
fetches the PDB file directly from RCSB and loads it exactly as if the user had
uploaded the file.

---

## Where the Fetch Happens: Frontend

The fetch runs entirely in the frontend (`PDBUpload.tsx`). The fetched PDB bytes
are wrapped in a `File` object and sent to the existing `/api/structures/upload`
endpoint — the same POST that file upload already uses.

**Why frontend, not backend proxy:**

- RCSB's download endpoint (`https://files.rcsb.org/download/`) serves files
  with `Access-Control-Allow-Origin: *`. Direct browser `fetch()` works without
  a proxy.
- Zero backend changes — the accession fetch is just an alternative *source* for
  the same byte stream the upload pipeline already handles.
- Keeps the architecture simple: one HTTP path from browser → backend.

**If CORS turns out to be blocked:** add a thin backend endpoint
`GET /structures/fetch?code=XXXX` that proxies the RCSB download and returns
raw bytes (or a 200 with the file). The frontend would call that instead. This
is a fallback, not the default plan.

---

## How to Reuse the Existing Upload/Parse Pipeline

```
RCSB fetch path                   Existing upload path
──────────────                    ────────────────────
fetch(RCSB URL)                   user drops/selects file
  → ArrayBuffer                     → File object
  → new File([bytes], '1HHO.pdb')
                 ↘                ↙
            FormData POST /api/structures/upload
                         ↓
                    parse_pdb() in backend
                         ↓
              onUploadSuccess(metadata, file)
                         ↓
              MolstarViewer loads from blob URL
```

The synthetic `File` object (`new File([bytes], code.toUpperCase() + '.pdb')`)
is identical to a user-selected file from the filesystem. The rest of the
pipeline — upload handler, backend parser, Mol* blob URL — is unchanged.

---

## Input Validation

Validate **before** making any network request.

- **Format:** exactly 4 alphanumeric characters — `/^[A-Za-z0-9]{4}$/`
- **Normalise:** convert to uppercase before use (RCSB filenames are uppercase)
- **Reject early:** display an inline error if the pattern doesn't match
- **Do not validate against a known list** — the full RCSB catalogue is too
  large; let RCSB's 404 response handle non-existent codes

---

## Error Handling

| Scenario | Detection | User-facing message |
|---|---|---|
| Invalid format | client-side regex | "Accession code must be 4 letters/numbers (e.g. 1HHO)" |
| Code does not exist | RCSB 404 response | "Structure not found in RCSB (check the accession code)" |
| Network failure / RCSB down | `fetch()` throws | "Could not reach RCSB — check your connection" |
| Valid code, malformed PDB | backend 422 | backend error message (same path as upload) |

`fetch()` does not throw on non-2xx HTTP status — the caller must check
`res.ok` after awaiting. A 404 from RCSB returns an HTML error page, not JSON,
so check `res.status === 404` explicitly before trying to read the body.

---

## State Integration

The fetched file follows the identical state path as an uploaded file:

```
App.tsx state:
  structure: StructureMetadata | null   ← set by onUploadSuccess (unchanged)
  pdbFile:   File | null                ← set to the synthetic File object
```

No new state in `App.tsx`. No changes to `types.ts`. No changes to
`MolstarViewer.tsx`. The synthetic `File` is a real `File` — Mol* reads it via
`URL.createObjectURL()` exactly as it does for uploaded files.

One subtle point: the synthetic file's `name` is `'1HHO.pdb'`, so
`structure.name` (derived from `file.filename` in the backend) will be
`'1HHO'` — clean and correct.

---

## CORS Considerations

RCSB's CDN at `https://files.rcsb.org/download/` includes:

```
Access-Control-Allow-Origin: *
```

Browser `fetch()` from `localhost:5173` is permitted. **Verify this in the
browser network tab on first test** — if the preflight fails or the header is
absent, fall back to the backend proxy approach described above.

No `mode: 'cors'` override needed; `fetch()` defaults to `'cors'` for
cross-origin requests.

---

## UI Placement and Design

Add an accession fetch section inside `PDBUpload.tsx`, below the existing drop
zone and the "Upload & Parse" button, separated by a visual divider:

```
┌─────────────────────────────────┐
│  Load Structure                 │
│                                 │
│  ┌─────────────────────────┐   │
│  │  Drop a .pdb file here  │   │  ← existing drop zone
│  │  or click to browse     │   │
│  └─────────────────────────┘   │
│                                 │
│  [ Upload & Parse ]             │  ← existing button
│                                 │
│  ── or fetch by accession ──    │  ← new divider
│                                 │
│  [  1HHO  ] [ Fetch ]          │  ← new row: input + button
│                                 │
│  (error message if any)         │
│                                 │
│  ┌─ metadata card ────────┐    │  ← existing, unchanged
│  │ ...                    │    │
│  └────────────────────────┘    │
└─────────────────────────────────┘
```

- Input: `maxLength={4}`, `placeholder="e.g. 1HHO"`, `onKeyDown` fires Fetch
  on Enter
- Fetch button: disabled when input is empty or loading
- Loading label: "Fetching…"
- Error message: reuses existing `.error-msg` class
- The two loading states (upload and fetch) are independent — each has its own
  `loading` boolean so they don't interfere

---

## Files to Change

| File | Change |
|---|---|
| `packages/web/src/components/PDBUpload.tsx` | Add accession input state, `handleFetch` function, divider + input row UI |
| `packages/web/src/index.css` | Add `.accession-row` flex layout (input + button side-by-side); `.divider` style |

No backend changes. No changes to `App.tsx`, `types.ts`, or
`MolstarViewer.tsx`.

---

## New State in PDBUpload.tsx

```ts
const [accession, setAccession]         = useState('');
const [fetchLoading, setFetchLoading]   = useState(false);
// error state is shared with the existing upload error
```

The existing `error` state is reused for both upload and fetch errors — only
one operation runs at a time.

---

## handleFetch Logic

```ts
async function handleFetch() {
  const code = accession.trim().toUpperCase();
  if (!/^[A-Za-z0-9]{4}$/.test(code)) {
    setError('Accession code must be 4 letters/numbers (e.g. 1HHO)');
    return;
  }
  setFetchLoading(true);
  setError(null);
  try {
    const res = await fetch(`https://files.rcsb.org/download/${code}.pdb`);
    if (res.status === 404) throw new Error('Structure not found in RCSB (check the accession code)');
    if (!res.ok) throw new Error(`RCSB returned ${res.status}`);
    const bytes = await res.arrayBuffer();
    const file = new File([bytes], `${code}.pdb`, { type: 'chemical/x-pdb' });

    const form = new FormData();
    form.append('file', file);
    const uploadRes = await fetch('/api/structures/upload', { method: 'POST', body: form });
    const data = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(data.detail ?? 'Parse failed');
    onUploadSuccess(data as StructureMetadata, file);
    setAccession('');
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Fetch failed');
  } finally {
    setFetchLoading(false);
  }
}
```

---

## Build Order

1. **Add accession input UI** — input + Fetch button + divider in `PDBUpload.tsx`,
   wired to state but no fetch logic yet. Verify it renders. Commit.

2. **Implement handleFetch** — validation, RCSB fetch, synthetic File, POST to
   upload endpoint, call `onUploadSuccess`. Verify with `1CRN`. Commit.

3. **Error states** — test each error path: bad format, non-existent code (e.g.
   `ZZZZ`), valid but unusual structure. Commit.

4. **CSS** — add `.accession-row` and `.divider` styles to `index.css`. Commit.

---

## Verification Steps

1. Type `1crn` (lowercase) → press Enter → structure loads as `1CRN`
2. Type `1HHO` → Fetch → haemoglobin loads with ligand in amber, water visible
3. Type `ZZZ` (3 chars) → inline error: "must be 4 letters/numbers"
4. Type `ZZZZ` (invalid code) → RCSB 404 → "Structure not found in RCSB"
5. After fetch, upload a local file → works normally (states don't interfere)
6. After local upload, fetch by accession → works normally
7. All Phase 4 controls (water toggle, colour, repr) work on fetched structures
8. `structure.name` in the metadata card shows `1HHO` not `1HHO.pdb`

---

## Gotchas

1. **`fetch()` does not throw on 404** — must check `res.ok` / `res.status`
   explicitly. A 404 from RCSB returns an HTML page; do not try to parse it as
   a PDB file.

2. **RCSB URL is case-sensitive** — always uppercase the code before building
   the URL.

3. **`new File([arrayBuffer], name)`** — the first argument is an array of
   parts (`BlobPart[]`), not the buffer directly. Wrap in an array:
   `new File([bytes], ...)`.

4. **Two loading states** — `loading` (file upload) and `fetchLoading` (RCSB
   fetch) must be independent. Disabling both buttons during either operation
   is fine; disabling the wrong button during a fetch looks broken.

5. **Shared error state** — clearing `error` at the start of each operation
   (upload or fetch) is enough; no need to split into separate error states.

6. **CORS fallback** — if `fetch('https://files.rcsb.org/...')` fails with a
   CORS error in the browser console, the fix is a backend proxy endpoint, not
   a frontend workaround. Do not use `mode: 'no-cors'` — it produces an opaque
   response with no readable body.

7. **Large structures** — some PDB files are 10–50 MB (e.g. ribosomes). The
   fetch may take several seconds. The "Fetching…" label covers this; no
   progress indicator needed for now.
