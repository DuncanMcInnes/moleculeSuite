# Plan: moleculeSuite MVP — Phase 1 Completion

## Context

The backend (PDB upload + BioPython parsing) and the frontend upload UI are **already fully implemented** and working. The only remaining gap is that `MolstarViewer.tsx` is a static placeholder — it shows metadata text but renders no 3D structure. This plan completes Phase 1 by wiring in a real Mol* viewer.

## Current State

| Component | Status |
|---|---|
| `POST /structures/upload` (FastAPI) | Complete |
| BioPython parsing in `pdb_service.py` | Complete |
| `PDBUpload.tsx` drag-and-drop UI | Complete |
| `MolstarViewer.tsx` 3D rendering | **Placeholder only** |
| `molstar` npm package | **Not installed** |

## Approach

**Keep the file in the browser.** The `File` object already exists in `PDBUpload` after the user drops it. We create a `blob:` URL from it and pass it directly to Mol*. No backend changes. No disk writes. No new endpoints.

Data flow:
```
User drops .pdb
  → PDBUpload: POST /api/structures/upload → metadata JSON
  → PDBUpload calls onUploadSuccess(metadata, file)   ← minor change
  → App holds both StructureMetadata + File in state
  → MolstarViewer receives both → renders 3D via blob: URL
```

## Files to Change

### 1. Install dependency
```
cd packages/web && npm install molstar
```

### 2. `packages/web/vite.config.ts`
Add two fields:
```ts
optimizeDeps: { exclude: ['molstar'] }         // don't pre-bundle; it manages its own workers
build: { chunkSizeWarningLimit: 10000 }        // molstar is ~6MB gzipped; silence the warning
```

### 3. `packages/web/src/components/PDBUpload.tsx`
One change: widen the callback to also pass the `File`:
```ts
// before
onUploadSuccess: (metadata: StructureMetadata) => void
// after
onUploadSuccess: (metadata: StructureMetadata, file: File) => void
```
Call site: `onUploadSuccess(data, file)` (the component already holds `file` in state).

### 4. `packages/web/src/App.tsx`
Add `pdbFile` state and wire it through:
```ts
const [pdbFile, setPdbFile] = useState<File | null>(null);
// in onUploadSuccess: (metadata, file) => { setStructure(metadata); setPdbFile(file); }
// pass pdbFile to MolstarViewer
```

### 5. `packages/web/src/components/MolstarViewer.tsx` (main rewrite)
Replace the placeholder with real Mol* logic:

**Props:** `{ structure: StructureMetadata | null, pdbFile: File | null }`

**Refs:**
- `containerRef` — the `<div>` Mol* renders its canvas into
- `pluginRef` — the live `PluginContext` instance
- `blobUrlRef` — current blob URL (for revocation on change/unmount)

**Effect 1 (mount/unmount):**
```ts
useEffect(() => {
  let plugin: PluginContext;
  (async () => {
    plugin = await createPluginUI(containerRef.current!, defaultSpec);
    pluginRef.current = plugin;
    // set background color to match dark theme: #0d1117
    plugin.canvas3d?.setProps({ renderer: { backgroundColor: Color(0x0d1117) } });
  })();
  return () => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    pluginRef.current?.dispose();
  };
}, []);
```

**Effect 2 (watch pdbFile):**
```ts
useEffect(() => {
  if (!pdbFile || !pluginRef.current) return;
  if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  const url = URL.createObjectURL(pdbFile);
  blobUrlRef.current = url;
  (async () => {
    const plugin = pluginRef.current!;
    await plugin.clear();
    const data = await plugin.builders.data.download({ url, isBinary: false });
    const traj = await plugin.builders.structure.parseTrajectory(data, 'pdb');
    await plugin.builders.structure.hierarchy.applyPreset(traj, 'default');
  })();
}, [pdbFile]);
```

**Layout:** The container `<div>` (bound to `containerRef`) fills the viewer panel. Empty state shows "Upload a structure to begin" when `pdbFile` is null.

**StrictMode gotcha:** React 18 StrictMode double-invokes effects in dev. Guard init: check `pluginRef.current` exists before re-initializing.

### 6. `packages/web/src/index.css`
Add `position: relative` to `.viewer-canvas` so Mol*'s absolutely-positioned canvas fills it correctly.

## Verification

1. `docker compose up -d` (or `npm run dev` in packages/web)
2. Navigate to http://localhost:5173
3. Drag-and-drop a .pdb file (e.g. 1CRN from RCSB)
4. Metadata panel should populate (chains, residue/atom counts)
5. Mol* canvas should render the 3D structure with default ball-and-stick/ribbon representation
6. Upload a second file — old structure clears, new one renders
7. Check browser console for no uncaught errors (blob URL cleanup, WebGL warnings are fine)
