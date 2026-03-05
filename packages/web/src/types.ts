/** Mirrors the StructureMetadataResponse Pydantic model from the API. */
export interface StructureMetadata {
  name: string;
  chains: string[];
  residue_count: number;
  atom_count: number;
}
