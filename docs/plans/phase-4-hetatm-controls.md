
# Phase 4 Plan: HETATM Controls — Hide Water / Highlight Ligands

## Context

Phase 3 is complete. The sequence card lets users click amino acids to select and
focus them in 3D. Phase 4 adds two HETATM-related controls:

1. **Hide/show water** — toggle that removes isolated HOH residues from the view,
   decluttering structures with thousands of water molecules.

2. **Highlight ligands** — visually distinguish non-water HETATM groups (haem,
   ATP, small molecules, ions) from the protein backbone with a distinct colour
   and representation style. Always-on; no toggle required.

---

## Core Problem with Current Architecture

`loadStructure` currently calls:

```ts
const component = await plugin.builders.structure.tryCreateComponentStatic(structure, 'all');
await plugin.builders.structure.representation.addRepresentation(component, { type, color });
```

A single `'all'` component holds every atom. There is no way to toggle water or
recolour ligands independently without rebuilding the whole component.

**Fix:** Split into separate components — `polymer`, `water`, `ligand`, `ion` —
each with its own representation and independently toggleable visibility.

---

## Verified Mol* API

### 1. Static component type strings

Source: `node_modules/molstar/lib/mol-plugin-state/helpers/structure-component.js` line 15

```ts
type StaticStructureComponentType =
  | 'all' | 'polymer' | 'protein' | 'nucleic'
  | 'water' | 'ion' | 'lipid' | 'branched'
  | 'ligand' | 'non-standard' | 'coarse';
```

- **`'polymer'`** — selects protein + nucleic acid atoms via `StructureSelectionQueries.polymer`.
- **`'water'`** — selects atoms where `entityType === 'water'` (HOH, DOD, etc.).
  Source: `structure-selection-query.js` line 234.
- **`'ligand'`** — selects `entityType === 'non-polymer'` (excluding oligosaccharide /
  lipid / ion), plus non-standard residues within polymer chains, plus one bonded
  layer (`ligandPlusConnected`). Captures haem, ATP, drugs, etc.
  Source: `structure-selection-query.js` lines 274-343.
- **`'ion'`** — selects atoms where `entitySubtype === 'ion'` (Mg2+, Zn2+, Cl-, etc.).
  Source: `structure-selection-query.js` line 239.

### 2. Creating separate components

```ts
const polymerComp = await plugin.builders.structure.tryCreateComponentStatic(structure, 'polymer');
const waterComp   = await plugin.builders.structure.tryCreateComponentStatic(structure, 'water');
const ligandComp  = await plugin.builders.structure.tryCreateComponentStatic(structure, 'ligand');
const ionComp     = await plugin.builders.structure.tryCreateComponentStatic(structure, 'ion');
```

**Critical:** `tryCreateComponentStatic` returns `undefined` (not a ref) when no
atoms of that type exist (`nullIfEmpty: true` by default). Always guard before
using the ref and before adding a representation.

Source: `builder/structure.js` lines 117-123.

### 3. Adding a representation to a component

Same builder call as before, called once per component:

```ts
// Polymer: user-selected repr + color
if (polymerComp) {
  await plugin.builders.structure.representation.addRepresentation(polymerComp, {
    type: repr,
    color: color,
  });
}

// Water: ball-and-stick, semi-transparent
if (waterComp) {
  await plugin.builders.structure.representation.addRepresentation(waterComp, {
    type: 'ball-and-stick',
    typeParams: { alpha: 0.4 },
    color: 'element-symbol',
  });
}

// Ligand: ball-and-stick, fixed highlight colour (amber)
if (ligandComp) {
  await plugin.builders.structure.representation.addRepresentation(ligandComp, {
    type: 'ball-and-stick',
    color: 'uniform',
    colorParams: { value: Color(0xf59e0b) },
  });
}

// Ion: ball-and-stick, element-symbol (CPK colours)
if (ionComp) {
  await plugin.builders.structure.representation.addRepresentation(ionComp, {
    type: 'ball-and-stick',
    color: 'element-symbol',
  });
}
```

`createStructureRepresentationParams` accepts `colorParams` when `color` is a
string (dispatches to `createParamsByName`). The `'uniform'` color theme accepts
`{ value: Color(...) }`. Source: `mol-theme/color/uniform.js`.

### 4. Storing component refs for visibility control

The return value of `tryCreateComponentStatic` is a `StateObjectSelector` with a
`.ref` string property. Cache this in a `useRef` on the component:

```ts
const waterRefStr  = useRef<string | null>(null);
const ligandRefStr = useRef<string | null>(null);
```

Store immediately after creating the component in `loadStructure`:

```ts
waterRefStr.current  = waterComp?.ref  ?? null;
ligandRefStr.current = ligandComp?.ref ?? null;
```

Clear when `plugin.clear()` is called (the old refs are now invalid):

```ts
await plugin.clear();
waterRefStr.current  = null;
ligandRefStr.current = null;
```

### 5. Toggling visibility

Import:
```ts
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
```

Source: `behavior/static/state.js` line 95. Walks the state tree from the given
ref and sets `isHidden` on every cell in the subtree. Causes immediate visual
hide/show without rebuilding geometry.

Usage:
```ts
function applyWaterVisibility(plugin: PluginContext, show: boolean) {
  if (!waterRefStr.current) return;
  setSubtreeVisibility(plugin.state.data, waterRefStr.current, !show);
}
```

### 6. Re-applying visibility after repr rebuild

`loadStructure` calls `plugin.clear()`, which destroys all components and their
refs. New components are created in the same call. Immediately apply current
`showWater` state before returning:

```ts
// at the end of loadStructure, after all addRepresentation calls:
if (!showWaterRef.current && waterRefStr.current) {
  setSubtreeVisibility(plugin.state.data, waterRefStr.current, true);  // hide
}
```

Use a `showWaterRef` (mirroring the pattern of `reprRef`/`colorRef`) so
`loadStructure` always reads the current value without stale closures.

### 7. Fixing handleColorChange to skip water/ligand/ion

Currently `handleColorChange` applies the colour update to ALL components via
`structures[0].components`. After Phase 4, this would recolour water/ligand,
breaking their fixed styles.

Fix: filter to only the polymer component. The tag for the polymer component is
`static-polymer` (set by `tryCreateComponentStatic` as `static-${type}`).
Source: `builder/structure.js` line 122. Tags are on `c.cell.transform.tags`
(a `Set<string>`). Source: `hierarchy-state.js` line 46.

```ts
const structs = plugin.managers.structure.hierarchy.current.structures;
const polymerComps = (structs[0]?.components ?? []).filter(
  c => c.cell.transform.tags?.has('static-polymer')
);
await plugin.managers.structure.component.updateRepresentationsTheme(polymerComps, { color });
```

---

## State Design

All new state lives entirely inside `MolstarViewer.tsx`. No changes to App.tsx,
types.ts, or the backend.

| State / Ref | Type | Purpose |
|---|---|---|
| `showWater` | `boolean` state (default `true`) | Drives button UI |
| `showWaterRef` | `useRef<boolean>` | Stale-closure-safe mirror for use inside `loadStructure` |
| `waterRefStr` | `useRef<string | null>` | Mol* state ref for the water component subtree |
| `ligandRefStr` | `useRef<string | null>` | Mol* state ref for the ligand component (reserved for future toggle) |

---

## UI

Add a third `repr-controls` row below the colour buttons. Shown only when
`pdbFile` is set. Button label changes to reflect current state:

```tsx
<div className="repr-controls">
  <button
    className={`repr-btn${!showWater ? ' repr-btn--active' : ''}`}
    onClick={handleWaterToggle}
  >
    {showWater ? 'Hide Waters' : 'Show Waters'}
  </button>
</div>
```

The active style (`repr-btn--active`) is repurposed here to mean "currently
hidden" — the button is lit when waters are hidden, giving a clear indicator.
No new CSS needed.

---

## Control Flow

### On file load (Effect 2 -> loadStructure)

```
plugin.clear()
  waterRefStr = null, ligandRefStr = null
  reset showWater = true, showWaterRef.current = true
parse -> createModel -> createStructure
tryCreateComponentStatic('polymer') -> addRepresentation (user repr + color)
tryCreateComponentStatic('water')   -> addRepresentation (ball-and-stick, alpha 0.4)
  waterRefStr = waterComp?.ref ?? null
tryCreateComponentStatic('ligand')  -> addRepresentation (ball-and-stick, amber uniform)
  ligandRefStr = ligandComp?.ref ?? null
tryCreateComponentStatic('ion')     -> addRepresentation (ball-and-stick, element-symbol)
apply showWaterRef: if (!showWaterRef.current && waterRefStr.current)
  setSubtreeVisibility(..., waterRefStr.current, true)
re-apply selectedResidueRef (unchanged from Phase 3)
```

### On repr change (handleReprChange)

```
reprRef.current = newRepr
setReprType(newRepr)
-> loadStructure(blobUrl, newRepr, colorRef.current)
   (same full rebuild; showWater visibility re-applied inside)
```

### On colour change (handleColorChange)

```
colorRef.current = newColor
setColorTheme(newColor)
filter structures[0].components to tag 'static-polymer'
-> updateRepresentationsTheme(polymerComps, { color: newColor })
   (water + ligand + ion colours unchanged)
```

### On water toggle (handleWaterToggle)

```
const next = !showWater
setShowWater(next)
showWaterRef.current = next
if (waterRefStr.current)
  setSubtreeVisibility(plugin.state.data, waterRefStr.current, !next)
```

---

## Files to Change

| File | Change |
|---|---|
| `packages/web/src/components/MolstarViewer.tsx` | Split `'all'` into 4 components; store water/ligand refs; add `showWater` state + toggle handler; fix `handleColorChange` to filter polymer only; add `setSubtreeVisibility` import |

No backend changes. No changes to `types.ts`, `App.tsx`, or `index.css`.

---

## New Import

```ts
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
```

No new npm packages needed.

---

## Gotchas

1. **`tryCreateComponentStatic` returns `undefined` on empty component** — guard
   every `addRepresentation` and every `waterRefStr.current` write. Structures
   without water will have `waterRefStr.current === null`; the water toggle
   becomes a silent no-op. Consider hiding the button when `waterRefStr.current`
   is null after load (using a `hasWater` state flag set in `loadStructure`).

2. **Ligand component includes bonded protein residues** — `ligandPlusConnected`
   expands one covalent bond layer. Adjacent polymer atoms appear in both the
   polymer component (cartoon) and the ligand component (amber ball-and-stick).
   This double-rendering is intentional in Mol*'s design and visually acceptable.

3. **`'ligand'` excludes ions, branched sugars, lipids** — ions are handled
   separately by the `'ion'` component. Lipids and branched sugars (carbohydrates)
   are not shown in this phase — they are uncommon in drug-target structures and
   can be added in a future phase if needed.

4. **`'uniform'` color requires `colorParams: { value: Color(...) }`** — passing
   `color: 'uniform'` without `colorParams.value` gives the default grey
   (`0xCCCCCC`). The `Color` import is already present in `MolstarViewer.tsx`.

5. **Colour change must filter to polymer only** — the most likely implementation
   mistake. `updateRepresentationsTheme(structures[0].components, ...)` without
   filtering will recolour water and ligand with the user's theme.

6. **File change must reset `showWater` to `true`** — Effect 2 currently resets
   `reprRef` and `colorRef` to defaults. Add `showWaterRef.current = true` and
   `setShowWater(true)` in the same block.

7. **Step-by-step build order** — from Phase 3 lesson learned: implement and
   commit one step at a time; a broken intermediate state is hard to debug.

8. **`label_seq_id` / `auth_seq_id` gotcha from Phase 3 does not apply here** —
   Phase 4 uses only static component selectors (no MolScript residue queries),
   so residue ID handling is irrelevant for this phase.

---

## Build Order

1. **Refactor `loadStructure`** — replace single `'all'` component with
   `polymer` + `water` + `ligand` + `ion`. Store refs. No new UI yet. Verify
   structure loads and renders correctly, with ligands in amber and water
   semi-transparent. Commit.

2. **Fix `handleColorChange`** — filter to `static-polymer` only. Verify colour
   change works and does not affect water/ligand. Commit.

3. **Add water toggle button and handler** — add `showWater` state, `showWaterRef`,
   button UI, `handleWaterToggle`, and post-load visibility application. Reset
   `showWater` to `true` on file change. Commit.

4. **Verify edge cases** — upload a structure with no water (e.g., NMR ensemble
   without HETATM); upload a structure with ligand but no water; upload a
   structure with both. Commit.

---

## Verification Steps

1. Upload **1CRN** (tiny protein, has water HOH, no ligand):
   - Protein shows in cartoon by chain colour
   - Water molecules show as semi-transparent ball-and-stick
   - "Hide Waters" button → water disappears instantly
   - "Show Waters" button → water reappears
2. Upload **3HTB** (has haem ligand, has water):
   - Haem shows in amber ball-and-stick
   - Protein in cartoon; water semi-transparent
   - Water toggle works independently of ligand
3. Change colour theme on 3HTB → polymer colour changes; haem and water unchanged.
4. Change repr to Ball & Stick → polymer changes; haem and water retain fixed styles.
5. Toggle water off -> change repr -> water stays hidden after rebuild.
6. Phase 3 residue selection still works after repr rebuild.
7. Upload 1CRN after 3HTB → controls reset: repr=Cartoon, color=By Chain,
   showWater=true.

---

## Outcome

**Status:** Planning
**Planned:** 2026-03-07
