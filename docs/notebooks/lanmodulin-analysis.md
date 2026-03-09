# Lanmodulin Pipeline — Notebook Analysis

## Purpose
Redesign a metal-binding protein to bind a **different, larger metal**. Lanmodulin natively binds Lanthanum (La³⁺). This pipeline "tricks" RFdiffusionAA into redesigning the binding pocket to accommodate Actinium (Ac³⁺) — a much larger ion.

**The trick:** The binding pocket geometry is pre-expanded geometrically (the "Ghost Motif") before diffusion, so the AI relaxes toward the larger geometry rather than compressing back to the original.

**Scientific significance:** Demonstrates that these tools can redesign **binding specificity**, not just affinity — potentially highly valuable for applications like radiometal chelation, biosensors, etc.

---

## The Core Insight: The Ghost Motif

Standard approach would fail — RFdiffusionAA would just collapse the pocket back to the original La³⁺ geometry. Instead:

1. **Pre-expand** the coordinating oxygen positions away from the metal center by `EXPANSION_DIST = 0.09 Å` (the "Actinium shift")
2. Feed this **expanded ghost structure** as input to partial diffusion
3. The model now relaxes toward the larger geometry
4. Use `partial_T=60` (more freedom than affinity maturation's 10)

---

## Pipeline Steps (in order)

### Phase 0: Prerequisites
- `input_clean.pdb` — Lanmodulin C-lobe with La³⁺, pre-cleaned
- Must be uploaded before running Phase 1

### Phase 1: Generate Ghost Motif
```python
# Configuration
INPUT_FILENAME = "input_clean.pdb"
OUTPUT_FILENAME = "input_ghost.pdb"
EXPANSION_DIST = 0.09    # The Actinium Shift (Angstroms)
TARGET_METAL = "LA"      # Find Lanthanum to define center

# Logic:
# 1. Find La³⁺ atom
# 2. NeighborSearch within 3.5Å — finds coordinating oxygen atoms
# 3. For each O atom: push outward from metal by EXPANSION_DIST
#    new_pos = old_pos + (unit_vector_away_from_metal * EXPANSION_DIST)
```
**Output:** `input_ghost.pdb` — same structure but coordinating oxygens expanded

### Phase 2: Run RFdiffusionAA (Partial Diffusion, High T)
```python
input_pdb = "/content/input_ghost.pdb"   # The expanded ghost
output_prefix = "/content/output/ghost_relax"

# Key parameters:
diffuser.partial_T = 60       # Much higher than affinity maturation (60 vs 10)
                              # More freedom to restructure the pocket
contigmap.contigs = ['59-59'] # Lanmodulin C-lobe is 59 residues
inference.num_designs = 5     # Small batch (5 designs)
```
**Outputs:** `output/ghost_relax_N.pdb`

### Phase 3: Align & Prepare for LigandMPNN (The "CA Disguise")
This phase has extra complexity because the metal must be handled carefully:

```python
# "CA Disguise" trick:
# LigandMPNN won't handle metal atoms well unless formatted as ATOM records
# Metal atoms are written as ATOM records (not HETATM) temporarily

# Steps:
# 1. Load original ghost (has La³⁺)
# 2. Separate protein CA atoms from metal atoms
# 3. Align each design backbone to original
# 4. Write protein with original sequence threading
# 5. Transform metal into new backbone frame
# 6. Write metal as ATOM record (the "disguise")
```

### Phase 3.5: Smart Metal Recovery
- Scans all output files for metal atoms
- Bulletproof PDB writer with strict column spacing
- Handles La³⁺ / Zn²⁺ / other metals robustly
- Skips trajectory/intermediate files
- **Output folder:** `mpnn_ready_atom/`

### Phase 3.6: The Oxygenator
- Adds missing backbone oxygens (RFdiffusion outputs backbone-only — no O atoms)
- Uses vector math: extends CA→C bond by 1.23Å to place O
- **Output folder:** `mpnn_ready_final/`

### Phase 4: LigandMPNN
```python
--pdb_path_multi     # JSON list of all prepared PDB files
--model_type         # "ligand_mpnn"
--checkpoint_ligand_mpnn  # "model_params/ligandmpnn_v_32_010_25.pt"
--chains_to_design   # "A"
--temperature        # 0.1 (conservative)
--batch_size         # 1
```
Includes doorstop residue analysis — checks for residues that block the pocket.

### Phase 5: Validation (ESMFold + RMSD)
```python
# For each designed sequence:
# 1. Get sequence from LigandMPNN FASTA output
# 2. Find matching reference PDB from Phase 3.6
# 3. ESMFold API prediction
# 4. Align prediction to reference
# 5. Report RMSD
```

---

## Key Data Flows

```
input_clean.pdb (Lanmodulin + La³⁺)
  → Ghost Motif expansion (+0.09Å at coordinating O) → input_ghost.pdb
  → Partial Diffusion (partial_T=60) → ghost_relax_N.pdb
  → Align + Metal recovery → mpnn_ready_atom/
  → Oxygenator → mpnn_ready_final/
  → LigandMPNN → sequences + PDBs
  → ESMFold → validation
```

---

## Critical Parameters for moleculeSuite Module

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input_pdb` | file | — | Metal-binding protein PDB (cleaned) |
| `target_metal` | str | `"LA"` | Metal to find in input (defines center) |
| `expansion_dist` | float | 0.09 | Å to expand coordinating oxygens |
| `neighbor_radius` | float | 3.5 | Å search radius for coordinating atoms |
| `partial_T` | int | 60 | Higher = more structural freedom |
| `chain_length` | int | 59 | Residues in binding domain |
| `num_designs` | int | 5 | Smaller batch (expensive search) |
| `mpnn_temperature` | float | 0.1 | Conservative sequence design |

---

## What Makes This Module Unique

Compared to the other three modules, this one has:
1. **Pre-processing step** (Ghost Motif) before diffusion — unique to this pipeline
2. **Metal handling** — special ATOM/HETATM formatting tricks for LigandMPNN
3. **Higher `partial_T`** — more structural freedom needed for specificity change vs affinity
4. **Oxygenator step** — adds missing backbone atoms post-diffusion
5. **Scientific framing:** changes *what* the protein binds, not just *how well*

---

## Known Issues / Patches
- Metal atoms must be disguised as ATOM records for LigandMPNN compatibility
- Missing backbone oxygens after RFdiffusion — Oxygenator step required
- Strict PDB column formatting critical — LigandMPNN crashes on malformed files
- Metal chain ID consistency must be preserved through all transformations

---

## Compute Requirements
- Same GPU requirements as RFdiffusionAA
- `partial_T=60` means more compute per design than affinity maturation (T=10)
- 5 designs × ~1-2 min each on L4
