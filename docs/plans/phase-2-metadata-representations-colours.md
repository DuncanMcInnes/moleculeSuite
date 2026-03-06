# Phase 2 Plan: Metadata Panel, Representation Switching, Colour Schemes

## Context

Phase 1 is complete: users can drop a .pdb file, the API parses it, and Mol* renders the 3D
structure. Phase 2 adds interactive controls — showing parsed metadata, switching between
representation styles, and changing colour schemes — all without backend changes.

---

## Current State (relevant to Phase 2)

| Item | Detail |
|---|---|
| `App.tsx` | holds `structure: StructureMetadata \| null` and `pdbFile: File \| null` |
| `MolstarViewer.tsx` | receives `structure` prop but **ignores it**; uses `applyPreset(traj, 'default')` |
| `PDBUpload.tsx` | renders upload panel; has no metadata display |
| `types.ts` | `StructureMetadata { name, chains, residue_count, atom_count }` |
| `index.css` | already has `.metadata-card`, `.stat`, `.stat__label`, `.stat__value` classes |

Critical problem with `applyPreset`: it bundles its own representation + colour internally,
giving no handle to update either. Phase 2 requires switching away from it.

---

## Verified Mol* API (from node_modules inspection)

### Representation type strings (`StructureRepresentationRegistry.BuiltIn`)
- `'cartoon'`
- `'ball-and-stick'`
- `'gaussian-surface'` (NOT `'surface'`)

### Colour theme strings (`ColorTheme.BuiltIn`)
- `'chain-id'`
- `'element-symbol'`
- `'uncertainty'` (this is B-factor — NOT `'b-factor'`)

### Manual build chain (replaces `applyPreset`)
```ts
const traj      = await plugin.builders.structure.parseTrajectory(data, 'pdb');
const model     = await plugin.builders.structure.createModel(traj);
const structure = await plugin.builders.structure.createStructure(model);
const component = await plugin.builders.structure.tryCreateComponentStatic(structure, 'all');
await plugin.builders.structure.representation.addRepresentation(component!, {
  type:  reprType,   // 'cartoon' | 'ball-and-stick' | 'gaussian-surface'
  color: colorTheme, // 'chain-id' | 'element-symbol' | 'uncertainty'
});
```

### Colour-only update (no rebuild)
```ts
await plugin.managers.structure.component.updateRepresentationsTheme(
  plugin.managers.structure.hierarchy.current.structures[0].components,
  { color: colorTheme }
);
```

---

## Feature 1: Metadata Panel

**What to build or modify:**
- `PDBUpload.tsx` — add optional `structure: StructureMetadata | null` prop; render
  `.metadata-card` below the upload button when structure is non-null.
- `App.tsx` — pass `structure` down to `PDBUpload` (one-line change).

**No CSS changes needed** — `.metadata-card`, `.stat`, `.stat__label`, `.stat__value` already exist.

**Mol* API calls:** none.

**Gotchas:** none beyond prop threading.

**What to show:**
```
Filename     1CRN.pdb
Chains       A, B
Residues     46
Atoms        327
```

---

## Feature 2: Representation Switching

**What to build or modify:**
- `MolstarViewer.tsx` — replace `applyPreset` with manual build; add `reprType` state
  (`'cartoon' | 'ball-and-stick' | 'gaussian-surface'`); extract an async `loadStructure`
  helper that accepts `(url, reprType, colorTheme)` and rebuilds on call.
- `index.css` — add `.repr-controls` / `.repr-btn` / `.repr-btn--active` classes.
- `App.tsx` — no changes needed; controls live inside MolstarViewer.

**Gotchas:**
1. `'gaussian-surface'` — not `'surface'`. Using the wrong string silently falls back to
   ball-and-stick.
2. Changing repr **type** requires a full rebuild (clear + re-parse + re-add). There is no
   "swap type" API in Mol*.
3. The blob URL must NOT be revoked when only the repr type changes — only revoke on new file.
   The same blob URL is reused for all subsequent rebuilds.
4. `tryCreateComponentStatic(structure, 'all')` returns `undefined` if the structure is
   empty. Guard: `if (!component) return`.
5. Effect 2 (watches `pdbFile`) can fire before the plugin's async init completes. Already
   guarded by `if (!pluginRef.current) return`, but the `loadStructure` helper must also
   check this.

**Implementation sketch:**
```ts
// State inside MolstarViewer
const [reprType, setReprType]     = useState<ReprType>('cartoon');
const [colorTheme, setColorTheme] = useState<ColorTheme>('chain-id');

// Ref to avoid stale-closure issues in effects
const reprRef  = useRef(reprType);
const colorRef = useRef(colorTheme);

// Helper called by both Effect 2 and control handlers
async function loadStructure(url: string, repr: ReprType, color: ColorTheme) { ... }
```

---

## Feature 3: Colour Schemes

**What to build or modify:**
- `MolstarViewer.tsx` — add `colorTheme` state; add colour button group; wire to
  `loadStructure` (simple, same rebuild pattern as repr switching).
- `index.css` — reuse `.repr-controls` / `.repr-btn` styles (same button-group pattern).

**Mol* colour theme → display label mapping:**
| Mol* string | Label |
|---|---|
| `'chain-id'` | By Chain |
| `'element-symbol'` | By Element |
| `'uncertainty'` | By B-factor |

**Colour change path (two-path strategy):**
- **Colour only** → use `updateRepresentationsTheme` (in-place, no re-parse):
  ```ts
  // TODO(optimise): consider batching multiple theme changes if perf becomes an issue
  await plugin.managers.structure.component.updateRepresentationsTheme(
    plugin.managers.structure.hierarchy.current.structures[0].components,
    { color: newColor }
  );
  ```
- **Repr type change** → full `loadStructure` rebuild (no swap-type API exists in Mol*).
- Keep `colorRef` in sync after each update so `loadStructure` always uses the correct
  colour when triggered by a type change.

**Gotchas:**
1. `'uncertainty'` is the Mol* internal name for B-factor. Do not use `'b-factor'` — it
   doesn't exist.
2. B-factor (`uncertainty`) colouring requires the PDB to have B-factor records; it
   gracefully falls back to grey if missing — no special handling needed.
3. `updateRepresentationsTheme` requires at least one loaded structure in the hierarchy.
   Guard: `if (!plugin.managers.structure.hierarchy.current.structures.length) return`.

---

## Build Order

1. **Metadata panel** — zero Mol* involvement; pure props + JSX. Validates the data flow
   and makes Phase 2 immediately visible to the user.
2. **Representation switching** — requires refactoring `applyPreset` to manual build, adding
   state + UI. This is the riskiest change; do it before colour to isolate issues.
3. **Colour schemes** — adds one more state variable and button group on top of the repr
   infrastructure. Straightforward once repr switching works.

---

## Files to Change (summary)

| File | Change |
|---|---|
| `packages/web/src/components/PDBUpload.tsx` | Accept optional `structure` prop; render metadata card |
| `packages/web/src/App.tsx` | Pass `structure` to `PDBUpload` |
| `packages/web/src/components/MolstarViewer.tsx` | Replace `applyPreset` with manual build; add reprType + colorTheme state; add control UI |
| `packages/web/src/index.css` | Add button-group styles for controls |

No backend changes. No new npm packages. No new files.

---

## Verification

1. `npm run dev` in `packages/web` (or `docker compose up -d`)
2. Upload a .pdb file → metadata card shows filename, chains, residue/atom counts
3. Click **Ball & Stick** → structure re-renders in ball-and-stick style
4. Click **Surface** → gaussian surface renders (may be slow on large files; expected)
5. Click **Cartoon** → back to ribbon
6. Click **By Element** → carbons grey, nitrogens blue, oxygens red
7. Click **By B-factor** → colour gradient from blue (low) to red (high)
8. Upload a second file → controls reset to Cartoon / By Chain; new structure loads
9. Browser console: no uncaught errors

---

## Outcome

**Status:** Complete  
**Completed:** 2026-03-05

### What was built
1. Metadata panel — filename, chains, residue count, atom count 
   displayed in dark card below upload button
2. Representation switching — Cartoon, Ball & Stick, Surface 
   (gaussian-surface) with active button highlighting
3. Colour schemes — By Chain, By Element, By B-factor 
   (uncertainty) with active button highlighting
4. Sequence card — per-chain single-letter amino acid sequence, 
   wrapped at 10 residues per line with position numbers
5. Mol* native UI hidden — regionState all set to hidden, 
   clean viewer with only our custom controls visible

### Deviations from plan
- Mol* built-in controls panel conflicted with custom buttons
  — fixed by setting regionState hidden in createPluginUI spec
- Sequence card required backend change — BioPython sequence 
  extraction added to pdb_service.py and response model updated
- chains type changed from string[] to { id, sequence }[] 
  to carry sequence data through to frontend

### Lessons learned
- Mol* representation strings are non-obvious: gaussian-surface 
  not surface, uncertainty not b-factor
- applyPreset bundles repr + colour internally — manual build 
  chain required for any custom control
- Backend changes require docker compose up --build
- Always hide Mol* native UI early — easier than working around it