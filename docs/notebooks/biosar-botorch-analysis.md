# BioSAR Navigator v2 (BoTorch) — Notebook Analysis

## Purpose
Bayesian optimisation over protein sequence space. Given a small number of sequences with measured affinity and stability values, trains Gaussian Process models and uses Upper Confidence Bound (UCB) acquisition to suggest the next sequences most likely to improve both properties simultaneously.

**This is the feedback loop module** — it takes experimental results and converts them into smarter next-round suggestions, closing the design→test→optimise cycle.

---

## The Core Approach

### Sequence Encoding: Sandberg Z-Scales
Amino acids are not discrete tokens — they're encoded as continuous 5-dimensional physicochemical descriptors:

```python
Z_SCALES = {
    'A': [0.24, -2.32, 0.60, -0.14, 1.30],  # z1=lipophilicity, z2=bulk/steric,
    'R': [3.52, 2.50, -3.50, 1.99, -0.17],  # z3=polarity, z4,z5=electronic
    # ... all 20 amino acids
}

def encode_seq(sequence):
    # Returns flat tensor: len(seq) * 5 dimensions
    return torch.tensor([Z_SCALES[aa] for aa in sequence]).flatten()
```

This means a 98-residue protein becomes a 490-dimensional vector. This is the key insight that makes Gaussian Processes tractable for proteins — no one-hot encoding, continuous space, proper distance metric.

### Gaussian Process + BoTorch
```python
from botorch.models import SingleTaskGP
from botorch.fit import fit_gpytorch_mll
from gpytorch.mlls import ExactMarginalLogLikelihood

# Two separate GPs — one per objective
gp_affinity   = SingleTaskGP(X_train, Y_affinity)
gp_stability  = SingleTaskGP(X_train, Y_stability)

# Fit via marginal log likelihood
mll = ExactMarginalLogLikelihood(gp.likelihood, gp)
fit_gpytorch_mll(mll)
```

### Multi-Objective Optimisation via Desirability
Rather than Pareto front, uses a desirability function to combine objectives:

```python
TARGET_AFFINITY_MIN  = 6.0   # pKd or similar
TARGET_AFFINITY_MAX  = 9.0
TARGET_STABILITY_MIN = 40.0  # Tm or ΔG or similar
TARGET_STABILITY_MAX = 70.0

def transform_to_desirability(value, t_min, t_max):
    d = (value - t_min) / (t_max - t_min)
    return torch.clamp(d, 0.0, 1.0)
```

### UCB Acquisition
```python
BETA = 1.0  # Exploration factor (higher = more exploratory)

# For each candidate sequence:
mean, var = gp.predict(candidate_z)
ucb = mean + BETA * sqrt(var)

# Combined desirability score:
d_aff  = desirability(ucb_affinity)
d_stab = desirability(ucb_stability)
combined = sqrt(d_aff * d_stab)  # Geometric mean
```

### Mutant Generation
```python
def generate_mutants(sequence, locked):
    # Single-point mutations at all non-locked positions
    # Returns list of all unique point mutants
    for i in range(len(sequence)):
        if i in locked: continue
        for aa in Z_SCALES.keys():  # All 20 amino acids
            if aa != sequence[i]:
                mutants.append(sequence[:i] + aa + sequence[i+1:])
    return list(set(mutants))
```

### Back-projection: Z-space → Amino Acid
When optimising in Z-space, need to convert back:
```python
def find_closest_aa(optimized_z):
    z_array = np.array(list(Z_SCALES.values()))
    dist = euclidean_distances(optimized_z.reshape(1,-1), z_array)[0]
    return aa_list[np.argmin(dist)], dist[np.argmin(dist)]
```

---

## Pipeline Steps

### Step 1: Install
```bash
pip install botorch gpytorch
```
No GPU strictly required (GP inference is CPU-tractable for small datasets).

### Step 2: Interactive Data Entry (in notebook)
```python
while True:
    seq  = input("Sequence N (or 'DONE'): ")   # Full amino acid sequence
    aff  = float(input("  Affinity: "))         # Measured value (e.g. pKd)
    stab = float(input("  Stability: "))        # Measured value (e.g. Tm °C)
```
Minimum 2 data points to train GP. Typical starting point: 3-10 sequences.

### Step 3: Train GPs + Score Candidates
1. Encode all input sequences as Z-vectors
2. Train `SingleTaskGP` on (X=Z-vectors, Y=affinity) and (X=Z-vectors, Y=stability)
3. Generate all single-point mutants from best current sequence
4. Score each mutant via UCB acquisition + combined desirability
5. Rank and return top suggestions

---

## Key Data Flows

```
Measured sequences + affinity + stability values
  → Z-scale encoding → 490-dim continuous vectors
  → Gaussian Process training (separate models per objective)
  → Mutant generation (single-point mutations)
  → UCB scoring → desirability combination
  → Ranked suggestion list → next sequences to synthesise/test
```

---

## Critical Parameters for moleculeSuite Module

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sequences` | list[str] | — | Measured sequences (min 2) |
| `affinity_values` | list[float] | — | Measured affinities |
| `stability_values` | list[float] | — | Measured stabilities |
| `target_affinity_min` | float | 6.0 | Lower bound of target range |
| `target_affinity_max` | float | 9.0 | Upper bound of target range |
| `target_stability_min` | float | 40.0 | Lower bound of target range |
| `target_stability_max` | float | 70.0 | Upper bound of target range |
| `beta` | float | 1.0 | UCB exploration factor |
| `locked_positions` | list[int] | [] | Positions to exclude from mutation |
| `n_suggestions` | int | 10 | Number of top suggestions to return |

---

## What Makes This Module Unique

1. **No GPU required** — GP inference is CPU-tractable
2. **Tiny dataset compatible** — works from 2 sequences upward
3. **Continuous sequence representation** — Z-scales enable meaningful distances
4. **Multi-objective** — jointly optimises affinity AND stability
5. **Closed-loop design** — takes experimental data as input, not PDB files
6. **Output is a ranked list of sequences**, not structures

---

## Integration with Other Modules

This is the **final stage of the loop**:

```
RFdiffusionAA or Partial Diffusion
  → LigandMPNN (sequences)
  → ESMFold validation
  → [WET LAB] Synthesis + measurement
  → BioSAR/BoTorch (feedback)
  → Ranked suggestions
  → Back to RFdiffusionAA or Partial Diffusion
```

In moleculeSuite, BioSAR should be able to:
- Accept sequences from previous pipeline runs (auto-populated)
- Accept manually entered experimental results
- Output suggestions that can directly feed into a new partial diffusion job

---

## Future Extensions (noted in notebook)
- Different acquisition functions (EI, PI, qNEHVI for true Pareto)
- Structural constraints on mutations
- Multi-fidelity: low-fidelity ESMFold scores + high-fidelity wet lab
- Batch suggestions (currently single-point mutations only)

---

## Compute Requirements
- **CPU only** — no GPU needed
- **RAM:** minimal (<4GB for typical dataset sizes)
- **Time:** seconds to minutes depending on sequence length and dataset size
