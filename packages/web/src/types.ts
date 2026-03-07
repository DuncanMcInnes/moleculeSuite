export interface ChainInfo {
  id: string;
  sequence: string;
  seq_ids: number[];
}

/** Mirrors the StructureMetadataResponse Pydantic model from the API. */
export interface StructureMetadata {
  name: string;
  chains: ChainInfo[];
  residue_count: number;
  atom_count: number;
}
