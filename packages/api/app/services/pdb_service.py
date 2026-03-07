"""
PDB parsing service.

Uses BioPython's PDBParser to extract basic structural metadata from an
uploaded PDB file without writing anything to disk.
"""

import io
from dataclasses import dataclass, field

from Bio.PDB import PDBParser, PPBuilder


@dataclass
class ChainInfo:
    id: str
    sequence: str
    seq_ids: list[int]


@dataclass
class PDBMetadata:
    name: str
    chains: list[ChainInfo]
    residue_count: int
    atom_count: int


def parse_pdb(filename: str, content: bytes) -> PDBMetadata:
    """
    Parse a PDB file from raw bytes and return structural metadata.

    Args:
        filename: Original filename, used as the structure identifier.
        content:  Raw bytes of the uploaded .pdb file.

    Returns:
        PDBMetadata with name, chain infos (id + sequence), residue count,
        and atom count.
    """
    structure_id = filename.removesuffix(".pdb")

    parser = PDBParser(QUIET=True)
    handle = io.StringIO(content.decode("utf-8", errors="replace"))
    structure = parser.get_structure(structure_id, handle)

    # Build per-chain sequences using BioPython's polypeptide builder.
    # PPBuilder concatenates peptide fragments within a chain into one sequence.
    builder = PPBuilder()
    sequence_by_chain: dict[str, str] = {}
    seq_ids_by_chain: dict[str, list[int]] = {}
    for chain in structure.get_chains():
        peptides = builder.build_peptides(chain)
        seq = "".join(str(pp.get_sequence()) for pp in peptides)
        sequence_by_chain[chain.id] = seq
        seq_ids_by_chain[chain.id] = [res.id[1] for pp in peptides for res in pp]

    chains = [
        ChainInfo(id=cid, sequence=sequence_by_chain.get(cid, ""),
                  seq_ids=seq_ids_by_chain.get(cid, []))
        for cid in sorted(sequence_by_chain)
    ]

    # id[0] == ' ' distinguishes standard amino-acid / nucleotide residues
    # from HETATM records (water, ligands) and insertion codes.
    residue_count = sum(
        1 for res in structure.get_residues() if res.id[0] == " "
    )

    atom_count = sum(1 for _ in structure.get_atoms())

    return PDBMetadata(
        name=structure_id,
        chains=chains,
        residue_count=residue_count,
        atom_count=atom_count,
    )
