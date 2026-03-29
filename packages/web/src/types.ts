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

/** Mirrors the Job dataclass from the API. */
export interface Job {
  id: string;
  module: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  parameters: Record<string, unknown>;
  error: string | null;
  output_dir: string | null;
}
