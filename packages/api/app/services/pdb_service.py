"""
PDB parsing service.

Uses BioPython's PDBParser to extract basic structural metadata from an
uploaded PDB file without writing anything to disk.
"""

import io
from dataclasses import dataclass

from Bio.PDB import PDBParser


@dataclass
class PDBMetadata:
    name: str
    chains: list[str]
    residue_count: int
    atom_count: int


def parse_pdb(filename: str, content: bytes) -> PDBMetadata:
    """
    Parse a PDB file from raw bytes and return structural metadata.

    Args:
        filename: Original filename, used as the structure identifier.
        content:  Raw bytes of the uploaded .pdb file.

    Returns:
        PDBMetadata with name, chain IDs, residue count, and atom count.
    """
    structure_id = filename.removesuffix(".pdb")

    parser = PDBParser(QUIET=True)
    # BioPython expects a file-like object; wrap the decoded content in StringIO
    # so we never touch the filesystem.
    handle = io.StringIO(content.decode("utf-8", errors="replace"))
    structure = parser.get_structure(structure_id, handle)

    chains = sorted({chain.id for chain in structure.get_chains()})

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
