import type { StructureMetadata } from "../types";

interface Props {
  structure: StructureMetadata | null;
}

export default function MolstarViewer({ structure }: Props) {
  return (
    <div className="viewer-panel">
      <div className="viewer-canvas">
        {structure ? <StructureSummary structure={structure} /> : <EmptyState />}
      </div>
    </div>
  );
}

function EmptyState() {
  return <p className="viewer-empty">Upload a structure to begin</p>;
}

function StructureSummary({ structure }: { structure: StructureMetadata }) {
  return (
    <div className="viewer-placeholder">
      <p className="viewer-placeholder__name">{structure.name}</p>

      <div className="viewer-stats">
        <ViewerStat label="Chains" value={structure.chains.join(" · ")} />
        <ViewerStat label="Residues" value={structure.residue_count.toLocaleString()} />
        <ViewerStat label="Atoms" value={structure.atom_count.toLocaleString()} />
      </div>

      {/* Placeholder for the real Mol* canvas — swap this div for the Mol* plugin container */}
      <p className="viewer-placeholder__hint">3D viewer (Mol*) coming soon</p>
      <span className="viewer-badge">PLACEHOLDER</span>
    </div>
  );
}

function ViewerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="viewer-stat">
      <span className="viewer-stat__value">{value}</span>
      <span className="viewer-stat__label">{label}</span>
    </div>
  );
}
