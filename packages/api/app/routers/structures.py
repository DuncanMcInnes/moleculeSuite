from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.services.pdb_service import PDBMetadata, parse_pdb

router = APIRouter(prefix="/structures", tags=["structures"])


class ChainInfoResponse(BaseModel):
    id: str
    sequence: str
    seq_ids: list[int]


class StructureMetadataResponse(BaseModel):
    name: str
    chains: list[ChainInfoResponse]
    residue_count: int
    atom_count: int


@router.post("/upload", response_model=StructureMetadataResponse)
async def upload_structure(file: UploadFile = File(...)) -> StructureMetadataResponse:
    """
    Accept a .pdb file upload and return basic structural metadata.

    - **name**: structure identifier (filename without extension)
    - **chains**: sorted list of chains, each with id and single-letter sequence
    - **residue_count**: number of standard residues (excludes HETATM)
    - **atom_count**: total atom count including heteroatoms
    """
    if not file.filename or not file.filename.lower().endswith(".pdb"):
        raise HTTPException(status_code=400, detail="Only .pdb files are accepted.")

    content = await file.read()

    try:
        metadata: PDBMetadata = parse_pdb(file.filename, content)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse PDB file: {exc}") from exc

    return StructureMetadataResponse(
        name=metadata.name,
        chains=[ChainInfoResponse(id=c.id, sequence=c.sequence, seq_ids=c.seq_ids) for c in metadata.chains],
        residue_count=metadata.residue_count,
        atom_count=metadata.atom_count,
    )
