
# Phase 3 Plan: Residue Selection — Sequence Card → 3D Highlight + Camera Focus

## Context

Phase 2 is complete. The sequence card shows per-chain amino acid sequences rendered in
10-residue-wide wrapped lines. Phase 3 adds interactivity: clicking an amino acid letter
in the sequence card selects that residue in the Mol* 3D viewer and smoothly zooms the
camera to it. Clicking again (or clicking a different residue) toggles/switches the
selection. Clicking the same residue again deselects.

---

## Verified Mol* API (from node_modules inspection)

### 1. Getting the loaded structure data object

```ts
const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
// `structure` is a `Structure` — the same type used in query contexts.
// Guard: if (!structure) return;
```

Source: `node_modules/molstar/lib/examples/basic-wrapper/index.js` line 63

### 2. Building a per-residue Loci from chain + residue number

```ts
import { Script }            from 'molstar/lib/mol-script/script';
import { StructureSelection } from 'molstar/lib/mol-model/structure';

const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
  'chain-test':   Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_asym_id(), chainId]),
  'residue-test': Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_seq_id(),  authSeqId]),
  'group-by':     Q.struct.atomProperty.macromolecular.residueKey(),
}), structure);

const loci = StructureSelection.toLociWithSourceUnits(sel);
```

Source: `basic-wrapper/index.js` lines 67–71 (adapted with chain filter added)

**Why `auth_seq_id` not `label_seq_id`:**
- For PDB files **without** SEQRES records, Mol* sets `label_seq_id = CifField.ofUndefined(...)`,
  which returns 0 for every residue — queries against it always fail silently.
- For PDB files **with** SEQRES records, `label_seq_id` is a 1-indexed sequential counter
  restarted at each chain.
- `auth_seq_id` is always the PDB ATOM record residue number (column 23–26), regardless of
  SEQRES presence. It matches BioPython's `res.id[1]`.
  Source: `node_modules/molstar/lib/mol-model-formats/structure/pdb/atom-site.js` lines 92–170.

**Why `auth_asym_id` not `label_asym_id`:**
- Mol* may rename chains using `label_asym_id` (appends `_1`, `_2`) when chain IDs repeat
  after TER records.
- `auth_asym_id` is always the original PDB chain letter, matching BioPython's `chain.id`.
  Source: `node_modules/molstar/lib/mol-model-formats/structure/pdb/atom-site.js` `LabelAsymIdHelper`.

Both `auth_asym_id` and `auth_seq_id` are registered in the MolScript query table.
Source: `node_modules/molstar/lib/mol-script/language/symbol-table/structure-query.js` lines 235–236.

### 3. Persistent visual selection (green/teal marker)

```ts
import { StructureElement } from 'molstar/lib/mol-model/structure';

if (!StructureElement.Loci.isEmpty(loci)) {
  plugin.managers.interactivity.lociSelects.selectOnly({ loci });
}
```

`selectOnly` first deselects everything in the structure, then marks only the given loci as
selected. Source: `interactivity.js` `LociSelectManager.selectOnly`.

### 4. Camera focus / zoom

```ts
plugin.managers.camera.focusLoci(loci);
// Default: extraRadius=4, minRadius=1, durationMs=250 (smooth animated zoom)
```

Source: `node_modules/molstar/lib/mol-plugin-state/manager/camera.js` lines 46–80.

### 5. Clear selection

```ts
plugin.managers.interactivity.lociSelects.deselectAll();
// Clears internal selection state AND removes all visual Select markers.
```

Source: `interactivity.js` `LociSelectManager.deselectAll`.

---

## Residue ID Gotcha: seq_ids must come from the backend

The SequenceCard currently tracks position (1-indexed into the sequence string), **not**
the PDB residue number. These differ when a chain starts at residue > 1 (e.g., residue 5
in some PDB files) or has gaps.

**Fix:** The backend must return `seq_ids: list[int]` alongside `sequence: str` for each
chain, where `seq_ids[i]` is the `auth_seq_id` (BioPython `res.id[1]`) of the i-th amino
acid in the sequence string.

BioPython already has this: every residue in a polypeptide fragment has `res.id[1]` which
is the author sequence number from the ATOM record.

---

## Multi-Chain Structures

Including both `auth_asym_id` (chain) and `auth_seq_id` (residue number) in the query is
sufficient to uniquely identify a residue across chains. Residue 5 in chain A and residue
5 in chain B are distinct queries.

No special handling needed for multi-chain structures beyond the two-field query.

---

## State Design

### Where state lives

| State | Location | Reason |
|---|---|---|
| `selectedResidue: { chainId, seqId } \| null` | `App.tsx` | Shared between SequenceCard (CSS highlight) and MolstarViewer (3D selection); lifts from both children |
| `reprType`, `colorTheme` | `MolstarViewer` (existing) | Viewer-internal, not needed by other components |

### Toggle logic (in App.tsx)

```ts
function handleResidueClick(chainId: string, seqId: number) {
  setSelectedResidue(prev =>
    prev?.chainId === chainId && prev.seqId === seqId
      ? null                    // same residue → deselect
      : { chainId, seqId }      // different residue → select new
  );
}
```

### Reset on new file

```ts
function handleUploadSuccess(metadata: StructureMetadata, file: File) {
  setStructure(metadata);
  setPdbFile(file);
  setSelectedResidue(null);   // clear any previous selection
}
```

---

## MolstarViewer: New Effect

A third useEffect watches `selectedResidue`. It runs **after** the structure is loaded
(Effect 2), so guards are sufficient.

```ts
// Effect 3: react to selectedResidue changes (select + focus, or deselect)
useEffect(() => {
  const plugin = pluginRef.current;
  if (!plugin) return;

  if (!selectedResidue) {
    plugin.managers.interactivity.lociSelects.deselectAll();
    return;
  }

  const structure =
    plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
  if (!structure) return;

  const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
    'chain-test':   Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_asym_id(), selectedResidue.chainId]),
    'residue-test': Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_seq_id(),  selectedResidue.seqId]),
    'group-by':     Q.struct.atomProperty.macromolecular.residueKey(),
  }), structure);

  const loci = StructureSelection.toLociWithSourceUnits(sel);
  if (StructureElement.Loci.isEmpty(loci)) return;

  plugin.managers.interactivity.lociSelects.selectOnly({ loci });
  plugin.managers.camera.focusLoci(loci);
}, [selectedResidue]);
```

**Also:** Effect 2 (file change) must reset `selectedResidue` — this is already handled
in `App.tsx` via `handleUploadSuccess`, which sets it to null before the file state
updates, causing Effect 3 to run a `deselectAll()` cleanup.

---

## SequenceCard Changes

Currently `<span className="sequence-residues">{residues}</span>` renders a 10-char
string as a single span. This must change to render individual per-residue spans.

```tsx
{residues.split('').map((aa, idx) => {
  const absIdx = pos - 1 + idx;          // absolute index into chain.sequence
  const seqId  = chain.seq_ids[absIdx];  // auth_seq_id for this residue
  const isSelected =
    selectedResidue?.chainId === chain.id && selectedResidue?.seqId === seqId;
  return (
    <span
      key={absIdx}
      className={`sequence-aa${isSelected ? ' sequence-aa--selected' : ''}`}
      onClick={() => onResidueClick(chain.id, seqId)}
    >
      {aa}
    </span>
  );
})}
```

New props:
- `selectedResidue: { chainId: string; seqId: number } | null`
- `onResidueClick: (chainId: string, seqId: number) => void`

---

## Files to Change (complete list)

| File | Change |
|---|---|
| `packages/api/app/services/pdb_service.py` | Add `seq_ids: list[int]` to `ChainInfo`; collect `res.id[1]` from polypeptide residues |
| `packages/web/src/types.ts` | Add `seq_ids: number[]` to `ChainInfo` |
| `packages/web/src/App.tsx` | Add `selectedResidue` state; `handleResidueClick`; reset on upload; pass props |
| `packages/web/src/components/SequenceCard.tsx` | Add props; render individual `<span>` per residue; apply selected class |
| `packages/web/src/components/MolstarViewer.tsx` | Add `selectedResidue` prop; Effect 3; new imports (`Script`, `StructureSelection`, `StructureElement`) |
| `packages/web/src/index.css` | Add `.sequence-aa`, `.sequence-aa:hover`, `.sequence-aa--selected` styles |

**Backend change requires `docker compose up --build`** (from Phase 2 lesson learned).

---

## New npm Imports

No new packages needed. Three new Mol* module imports in `MolstarViewer.tsx`:

```ts
import { Script }            from 'molstar/lib/mol-script/script';
import { StructureSelection, StructureElement } from 'molstar/lib/mol-model/structure';
```

(`StructureElement` already used in `interactivity.js` types; needs to be imported here
for `StructureElement.Loci.isEmpty` guard.)

---

## Build Order

1. **Backend: add `seq_ids`** — smallest change; validates data flow before touching frontend.
   `docker compose up --build` to apply.
2. **`types.ts`: add `seq_ids: number[]`** — keeps TypeScript happy immediately.
3. **`App.tsx`: add `selectedResidue` state + handler** — no visible UI change yet.
4. **`SequenceCard.tsx`: individual spans + click handlers** — clicking works, CSS highlight
   visible, 3D selection not yet wired.
5. **`MolstarViewer.tsx`: Effect 3** — 3D selection + camera focus complete.
6. **`index.css`: `.sequence-aa` styles** — polished appearance.

---

## Gotchas

1. **`label_seq_id` silently returns 0 for PDB without SEQRES** — always use `auth_seq_id`.
   This is the most important gotcha; using the wrong property gives an empty loci with no
   error, so the click appears to do nothing.

2. **`label_asym_id` vs `auth_asym_id`** — Mol* can rename chains; use `auth_asym_id`
   which always matches the original PDB chain letter and BioPython's `chain.id`.

3. **Multi-chain: same seq number in different chains** — handled correctly because the
   query includes both `auth_asym_id` and `auth_seq_id`.

4. **Empty loci guard** — `selectOnly` on an empty loci will throw. Always check
   `StructureElement.Loci.isEmpty(loci)` before calling `selectOnly`.

5. **Effect 3 timing** — Effect 3 fires on every render where `selectedResidue` changes.
   It checks `pluginRef.current` and `structure` at call time, so if called before the
   plugin or structure is ready, it safely returns without error.

6. **PPBuilder skips HETATM** — `seq_ids` only covers standard amino acid residues (what
   PPBuilder returns). HETATM residues (water, ligands, etc.) are not in the sequence
   string and cannot be selected via the sequence card. This is intentional.

7. **Insertion codes (rare)** — PDB residues with insertion codes (e.g., `12A`, `12B`)
   have the same `auth_seq_id` integer but differ by ins code. BioPython's `res.id[1]`
   returns the integer, losing the ins code. For the vast majority of PDB structures,
   this is not an issue. If collision occurs, the query would select all atoms at that
   seq number in that chain — visually acceptable, not a crash.

8. **`deselectAll()` timing on file change** — `App.tsx` sets `selectedResidue = null`
   in `handleUploadSuccess`. Effect 3 fires `deselectAll()` immediately. Effect 2 fires
   `plugin.clear()` shortly after (driven by `pdbFile` state update). Both order and
   ordering are safe: `deselectAll()` on a cleared plugin is a no-op.

---

## CSS Sketch

```css
/* Individual residue letter in sequence card */
.sequence-aa {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 2px;
  transition: background 0.1s, color 0.1s;
}

.sequence-aa:hover {
  background: var(--accent-blue);
  color: var(--bg);
}

.sequence-aa--selected {
  background: var(--accent-blue);
  color: var(--bg);
  font-weight: 600;
}
```

---

## Verification Steps

1. Upload 1CRN (single chain, 46 residues)
2. Click residue letter `T` (position 1) → residue 1 highlighted in 3D, camera zooms in
3. Click same letter again → deselects, camera stays (does not auto-reset)
4. Click different letter → switches highlight to new residue, camera refocuses
5. Upload 1HHO (4 chains) → selection clears; click residue in chain B → only chain B
   residue highlighted, not the matching seq number in chain A
6. Click outside sequence card area → no crash, selection persists
7. Switch repr (Cartoon → Ball & Stick) while residue selected → selection marker
   persists after the `loadStructure` rebuild (note: Effect 3 does not re-run on repr
   change; the visual selection marker is cleared by `plugin.clear()` on repr change)

**Known limitation from step 7:** The `loadStructure` call in `handleReprChange` calls
`plugin.clear()`, which removes all visual markers including the selection. After a repr
change, the 3D selection will be lost visually even though `selectedResidue` state still
holds the value. **Resolution for this plan:** After `loadStructure` completes, trigger
Effect 3 by setting `selectedResidue` to a copy (force re-render). Or: call
`selectAndFocus` explicitly at the end of `loadStructure` if `selectedResidue` is set.
This is an implementation detail to handle during coding — either approach is acceptable.

---

## Outcome

**Status:** Complete  
**Completed:** 2026-03-07

### What was built
- Click residue in sequence card → highlights in 3D viewer + camera zooms
- Click same residue → deselects
- Click different residue → switches selection
- Selection persists across representation changes
- Resets on new file upload
- Tested with 1CRN (single chain) and 1HHO (4 chains)

### Deviations from plan
- SequenceCard moved from PDBUpload.tsx to App.tsx — 
  cleaner architecture, props flow directly
- Step-by-step build required after full implementation 
  caused black viewer on first attempt

### Lessons learned
- auth_seq_id not label_seq_id — label_seq_id silently 
  returns 0 for PDB without SEQRES records
- auth_asym_id not label_asym_id — Mol* can rename chains
- Always build complex features step by step with commits 
  between each file change
- Revert immediately when something breaks — don't debug 
  a broken state