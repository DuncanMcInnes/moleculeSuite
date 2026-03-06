# Feature Plan: Rainbow (N→C Sequence) Colour Scheme

## Context

Phase 2 is complete. Three colour buttons exist: By Chain (`chain-id`), By Element
(`element-symbol`), By B-factor (`uncertainty`). This feature adds a fourth: Rainbow,
coloured blue (N-terminus) → cyan → green → yellow → orange → red (C-terminus), matching
the RCSB PDB default sequence rainbow style.

---

## Verified Mol* Colour Theme String

**`'sequence-id'`**

Confirmed in `node_modules/molstar/lib/mol-theme/color.js` (line 139) and
`node_modules/molstar/lib/mol-theme/color/sequence-id.js`.

- Registered as a `ColorTheme.BuiltIn` — accepted by all existing Mol* colour APIs.
- Maps each atom/bond to a colour based on its `label_seq_id` (residue sequence number).
- Scale domain is normalised per-entity (0 → entity sequence length), so each chain's
  N-terminus maps to scale position 0 (blue) and C-terminus maps to 1 (red), independently
  of chain length.
- Granularity: `'group'` — all atoms in a residue share one colour (per-residue, not
  per-atom), which is the correct behaviour for a sequence rainbow.
- Default colour scale: **`turbo-no-black`** — a smooth 28-stop gradient from blue-purple
  (`0x4a41b5`) through cyan → green → yellow → orange → dark red (`0x960d00`). This is
  the closest built-in match to RCSB's rainbow. The 5-stop `simple-rainbow`
  (`blue, green, yellow, orange, red`) also exists but misses the cyan band.

---

## Does It Fit `updateRepresentationsTheme`?

**Yes, exactly.** `'sequence-id'` is a standard `ColorTheme.BuiltIn`, so the existing
colour-only update path works without modification:

```ts
await plugin.managers.structure.component.updateRepresentationsTheme(
  structures[0].components,
  { color: 'sequence-id' }
);
```

No full `loadStructure` rebuild is needed. This is identical to how `'chain-id'`,
`'element-symbol'`, and `'uncertainty'` are applied.

---

## Changes Required

### 1. `MolstarViewer.tsx`

**`ColorTheme` union type** (line 12) — add `'sequence-id'`:
```ts
type ColorTheme = "chain-id" | "element-symbol" | "uncertainty" | "sequence-id";
```

**`COLOR_OPTIONS` array** (line 25–29) — add one entry:
```ts
{ value: "sequence-id", label: "Rainbow" },
```

That is the complete change. No new state, no new handlers, no new effects. The existing
`handleColorChange` function and reset logic already handle any `ColorTheme` value.

### 2. No other files need to change

| File | Change needed? | Reason |
|---|---|---|
| `types.ts` | No | `ColorTheme` is local to MolstarViewer |
| `App.tsx` | No | Colour state lives inside MolstarViewer |
| `index.css` | No | Buttons use existing `.repr-btn` / `.repr-btn--active` styles |
| API / backend | No | Pure client-side Mol* theme |

---

## Gotchas

1. **Per-chain independent normalisation.** In multi-chain structures, each chain's N→C
   is normalised independently. Residue 1 of chain A and residue 1 of chain B both appear
   blue. This is the RCSB convention and is correct — but worth knowing if the user expects
   a global N→C rainbow across all chains. (That would require a custom theme; out of scope.)

2. **Requires `label_seq_id` in the PDB.** Standard PDB files always have this. If a
   non-standard file has missing seq IDs, `sequence-id` gracefully falls back to grey
   (`0xCCCCCC`) — no crash, no special handling needed.

3. **Default scale is `turbo-no-black`, not a classic HSV rainbow.** The gradient closely
   matches RCSB visually but is not pixel-identical. If an exact RCSB match is needed in
   future, the `colorParams` overload of `updateRepresentationsTheme` can be used to pass
   `{ list: { kind: 'set', colors: [...] } }` — but this is not needed for the initial
   feature and would require a more complex call signature.

4. **Reset on new file.** `MolstarViewer` already resets `colorTheme` to `'chain-id'` when
   a new file is uploaded (`Effect 2`, line 94). Rainbow will reset correctly with no change.

5. **`'sequence-id'` is NOT the same as `'polymer-index'`.** `polymer-index` colours each
   chain instance a different flat colour (like `chain-id` but for polymer units). Do not
   confuse the two.

---

## Implementation Sketch

Only two lines in `MolstarViewer.tsx` change:

```ts
// Line 12 — extend the type union
type ColorTheme = "chain-id" | "element-symbol" | "uncertainty" | "sequence-id";

// Lines 25-29 — add entry to COLOR_OPTIONS
const COLOR_OPTIONS: { value: ColorTheme; label: string }[] = [
  { value: "chain-id",       label: "By Chain" },
  { value: "element-symbol", label: "By Element" },
  { value: "uncertainty",    label: "By B-factor" },
  { value: "sequence-id",    label: "Rainbow" },   // ← new
];
```

---

## Verification Steps

1. Upload any .pdb file
2. Click **Rainbow** → structure colours from blue (N-terminus) to red (C-terminus)
3. Click **By Chain** → returns to chain colouring (rainbow deselected)
4. Upload a second file → buttons reset to **By Chain**; Rainbow deselects
5. Test with a multi-chain structure (e.g., 1HHO) → each chain independently rainbowed
6. Browser console: no uncaught errors

---

## Build Order

1. Extend `ColorTheme` type union
2. Add `Rainbow` entry to `COLOR_OPTIONS`
3. No other changes

Estimated diff: ~2 lines changed, 1 line added.
