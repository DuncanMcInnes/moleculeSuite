# RFdiffusionAA Pipeline — Notebook Analysis

## Purpose
Design novel proteins that fold around small molecules (drugs/ligands). Uses the "all atom" variant of RFdiffusion which handles non-protein atoms. The designed backbone is then translated to real amino acid sequences by LigandMPNN.

**Original context:** Designing proteins smaller than a native protein that retain the exact structure and function, built around a specific ligand.

---

## Pipeline Steps (in order)

### Step 1: Environment Setup
- Installs conda, Python 3.10, PyTorch 2.0.1 (CUDA 11.8)
- Key packages: `pytorch`, `rdkit`, `openbabel`, `dgl==1.1.2+cu118`, `hydra-core`, `e3nn==0.5.1`, `biopython`, `numpy<2.0`
- Clones: `rf_diffusion_all_atom`, `RoseTTAFold-All-Atom`, `SE3Transformer`
- Downloads weights: `RFDiffusionAA_paper_weights.pt`
- Critical patches: symlinks `rf2aa` and `SE3Transformer`, patches `idealize_backbone.py`

### Step 2: Run RFdiffusionAA Inference
**Script:** `run_inference.py`  
**Key parameters:**
```python
input_pdb         # Input protein+ligand PDB
output_prefix     # Where to write designed backbones
contigmap.contigs # e.g. "[1-3,A4-63,4-6,A74-98,4-6]"
                  # Format: "N-N" = hallucinate, "ChainRES-RES" = fix from input
ppi.hotspot_res   # Residues that lock backbone geometry to ligand e.g. "['A11','A13']"
potentials.guiding_potentials  # e.g. "['type:ligand_ncontacts,weight:2']"
inference.num_designs           # Batch size (20 in example)
diffuser.partial_T              # If set: partial diffusion (refinement mode)
```
**Outputs:** `result/design_anchor_N.pdb` (backbone only, no sequence)

### Step 3: Align & Repair Designs
- Loads designed backbones
- Sliding window alignment (CA atoms) to original structure
- Removes designs with RMSD > 2.0Å to original anchor
- Writes clean PDB with: aligned protein backbone + dummy oxygens + ligand copied from input
- **Output folder:** `mpnn_inputs/`

### Step 4: Run LigandMPNN
**Script:** `LigandMPNN/run.py`  
**Key parameters:**
```python
--pdb_path          # Individual PDB or --pdb_path_multi JSON
--model_type        # "ligand_mpnn"
--chains_to_design  # "A"
--fixed_residues_multi  # JSON: {filepath: "A36 A37 ..."}
--pack_side_chains  # 1
--number_of_batches # 8
--temperature       # 0.2
```
- Fixed residues determined by geometric match to original structure (distance < 2.0Å)
- **Output:** sequence files + packed PDB structures in `mpnn_results_final/`

### Step 5: Validate via ESMFold
- Posts sequences to `https://api.esmatlas.com/foldSequence/v1/pdb/`
- Calculates pLDDT (confidence) from B-factor field
- Measures "drift" — distance from designed binding residue to ligand
- Superimposes on scaffold to measure RMSD
- Produces ranking CSV + zipped PyMOL-ready pairs

---

## Key Data Flows

```
input.pdb (protein + ligand)
  → RFdiffusionAA → design_anchor_N.pdb (backbone only)
  → Align+Repair → aligned_design_N.pdb (backbone + ligand)
  → LigandMPNN → sequences + packed PDBs
  → ESMFold API → folded prediction PDB
  → RMSD + drift analysis → ranking_report.csv
```

---

## Critical Parameters for moleculeSuite Module

| Parameter | Type | Description |
|-----------|------|-------------|
| `input_pdb` | file | Protein + ligand PDB (ligand as HETATM) |
| `contig_string` | string | e.g. `"1-3,A4-63,4-6,A74-98,4-6"` |
| `hotspot_residues` | list[str] | e.g. `["A11","A13","A14"]` |
| `guiding_potential_weight` | float | Default 2.0 (`ligand_ncontacts`) |
| `num_designs` | int | Batch size (20 typical) |
| `ligand_chain` | str | Chain ID of ligand in input PDB |
| `ligand_res_id` | int | Residue number of ligand |
| `motif_ranges` | list[tuple] | Residue ranges to lock in MPNN |
| `design_radius` | float | Å radius around ligand to allow design (default 8.0) |
| `mpnn_temperature` | float | 0.2 (higher = more creative) |
| `mpnn_batches` | int | 8 |

---

## Python Packages Required

```
# Conda (GPU-specific)
python=3.10
pytorch==2.0.1
pytorch-cuda=11.8
rdkit
openbabel
cudatoolkit=11.8
mkl<2024.0.0

# Pip
dgl==1.1.2+cu118
hydra-core
e3nn==0.5.1
numpy<2.0
biopython
pandas
scipy
fire
tqdm
joblib
icecream
pyrsistent
assertpy
deepdiff
pynvml
psutil

# LigandMPNN additional
ml_collections
dm-tree
prody
```

---

## External Repositories Required
- `https://github.com/baker-laboratory/rf_diffusion_all_atom.git`
- `https://github.com/baker-laboratory/RoseTTAFold-All-Atom.git`
- `https://github.com/NVIDIA/SE3-Transformer.git`
- `https://github.com/dauparas/LigandMPNN.git`

## Model Weights Required
- `RFDiffusionAA_paper_weights.pt` — from `http://files.ipd.uw.edu/pub/RF-All-Atom/weights/`
- LigandMPNN weights — via `get_model_params.sh`

---

## Known Issues / Patches
- `idealize_backbone.py` must be patched to prevent crash (replaces with `shutil.copy`)
- `rf2aa` must be symlinked from `RoseTTAFold-All-Atom`
- `SE3Transformer` must be symlinked into `env/SE3Transformer`
- numpy `dtype=np.int` deprecation in LigandMPNN's openfold — patch with `sed`
- ESMFold API rate limits: 403/429 → wait 60s; always sleep 4s between requests
- `--fixed_residues_multi` expects space-separated string (not list) per file
- Chain IDs from RFdiffusion may be empty — default to "A"

---

## Output Files
- `result/design_anchor_N.pdb` — raw backbone designs
- `mpnn_inputs/aligned_design_anchor_N.pdb` — aligned + ligand merged
- `mpnn_results_final/` — LigandMPNN sequence outputs
- `final_analysis/pred_*.pdb` — ESMFold predictions
- `validation_pairs/` — BLUEPRINT + REALITY paired folders
- `ranking_report.csv` — ranked by RMSD/drift

---

## Compute Requirements
- **GPU required:** L4 or better (Colab L4 used in notebook)
- **RAM:** ~20GB for model weights + inference
- **Time per design:** ~1 min per design on L4
- **Batch of 20:** ~20-30 min total
