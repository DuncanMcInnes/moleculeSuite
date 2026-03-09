# Partial Diffusion Pipeline — Notebook Analysis

## Purpose
Affinity maturation — improve the binding affinity of an existing protein-ligand pair. Unlike RFdiffusionAA (which designs from scratch), partial diffusion **refines an existing structure** by "melting" it slightly and letting the model re-denoise it toward a better binding geometry.

**Key insight:** `diffuser.partial_T=10` means only 10 noising steps (vs 200 for full diffusion). This keeps the protein close to the original structure while allowing local pocket rearrangement.

---

## How it Differs from RFdiffusionAA

| Aspect | RFdiffusionAA | Partial Diffusion |
|--------|--------------|-------------------|
| Starting point | Input PDB with ligand | Existing optimised protein + ligand |
| Contig string | Mixed hallucinate/fix e.g. `"1-3,A4-63"` | Full chain fixed e.g. `"98-98"` |
| `partial_T` | Not set (full diffusion) | 10 (slight melt) |
| `guide_decay` | Not set | `quadratic` |
| Goal | Design new binding protein | Improve existing binder |
| Hallucination | Yes (new regions) | No (preserve identity) |
| Batch size | 20 | 10 |

---

## Pipeline Steps (in order)

### Step 1: Environment Setup
Identical to RFdiffusionAA setup — same repos, weights, patches. See `rfidiffusionaa-analysis.md`.

### Step 2: Run Partial Diffusion
**Script:** `run_inference.py` (same as RFdiffusionAA)  
**Key parameters:**
```python
input_pdb = "/content/input.pdb"    # Must contain protein + ligand + any cofactors
output_prefix = "result/affinity_opt"
contig_arg = "['98-98']"            # Full chain, no cuts — preserve entire structure
                                    # Number = protein chain length
guiding_potentials = "['type:ligand_ncontacts,weight:2']"

# THE CRITICAL DIFFERENCE:
diffuser.partial_T = 10             # Only 10 steps of noise (vs 200 full)
potentials.guide_decay = "quadratic" # Smooth relaxation at end

inference.num_designs = 10          # 10 samples is enough for refinement
```

**Actual output example (from notebook logs):**
- Timestep 10: `?A?AASA?A?VA?ASGS??A?AVSVSASGS?SAT??GSASSA?AA?A?AASAASAS??GSV?G?QKSESAAAVS?ESGSAAAAS???AA??SAAAAAV`
- By timestep 1: sequence becomes more defined, `?` fills in
- Each design takes ~0.19 minutes on L4

**Outputs:** `result/affinity_opt_N.pdb`

### Step 3: Align & Thread Original Sequence
Slightly different from RFdiffusionAA:
- Aligns designed backbone to original (full chain, not sliding window)
- **Threads the original sequence identity** onto the new backbone (not novo sequence)
- Ligand is transformed into new backbone frame using rotation matrix
- Outputs: `mpnn_inputs_aligned/aligned_N.pdb`

```python
# Key difference: alignment direction
# Fixed = design (new backbone)
# Moving = original structure
sup.set_atoms(mob_ca_atoms, orig_ca_atoms)  # align original TO design
rot, tran = sup.rotran
# Then: new_coord = np.dot(old_coord, rot) + tran  # transform ligand
```

### Step 4: Run LigandMPNN (Sphere Optimization)
```python
DESIGN_RADIUS = 8.0      # Only redesign residues within 8Å of ligand
affinity_drivers = [10, 12, 13, 14, 15, 17, 19, 43]  # Always lock these

# Lock logic (per residue):
# 1. Lock "affinity drivers" (key binding residues — always keep identity)
# 2. Lock cysteines (structural)
# 3. Lock anything > 8Å from ligand (not in binding sphere)
# 4. Allow redesign only in binding sphere

--repack_everything 1    # CRITICAL: allows drivers to rotate (sidechain optimisation)
--temperature 0.1        # Low temp = conservative changes
--number_of_batches 8
```

### Step 5: Validate (ESMFold + RMSD)
Same as RFdiffusionAA:
- ESMFold API for structure prediction
- RMSD between blueprint and prediction (pass threshold: < 1.5Å)
- Resume mode: skips already-processed designs
- Injects ligand into prediction for PyMOL viewing

**Actual results from notebook:**
- Most designs: RMSD 0.49–0.67Å ✅ PASS
- Failures: aligned_1_1 (2.348Å), aligned_6_2 (2.241Å) — ~5% failure rate

---

## Key Data Flows

```
input.pdb (existing protein + ligand — already optimised)
  → Partial Diffusion (partial_T=10) → affinity_opt_N.pdb
  → Align + Thread original sequence → aligned_N.pdb
  → LigandMPNN (sphere, low temp) → sequences + packed PDBs
  → ESMFold API → folded predictions
  → RMSD analysis → validation pairs
```

---

## Critical Parameters for moleculeSuite Module

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input_pdb` | file | — | Existing protein+ligand (fully optimised) |
| `chain_length` | int | — | Number of residues in protein chain |
| `partial_T` | int | 10 | Noise steps (lower = closer to original) |
| `guide_decay` | str | `quadratic` | How guiding potential fades |
| `guiding_potential_weight` | float | 2.0 | `ligand_ncontacts` strength |
| `num_designs` | int | 10 | Refinement batch size |
| `design_radius` | float | 8.0 | Å around ligand to allow redesign |
| `affinity_drivers` | list[int] | — | Residue indices to always lock |
| `mpnn_temperature` | float | 0.1 | Low temp for conservative changes |
| `mpnn_batches` | int | 8 | Sequences per backbone |

---

## Differences from RFdiffusionAA Module (for moleculeSuite)

1. **Input validation:** must verify input is an already-designed/optimised structure
2. **Contig string:** always `"[N-N]"` (full chain length, no cuts)
3. **`partial_T` exposed as key parameter** — tuning knob for how much to melt
4. **Threading logic:** uses original sequence identity (not novo design)
5. **Sphere-based locking** with explicit affinity driver list
6. **`--repack_everything 1`** flag in MPNN

---

## Known Issues
- Same environment setup issues as RFdiffusionAA
- Hydra warning about `_self_` in defaults — cosmetic, not fatal
- ESMFold timeout handling with retry logic critical for large batches
- `partial_T` override triggers a Hydra warning — expected behaviour
