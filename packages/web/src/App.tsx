import { useState } from "react";
import MolstarViewer from "./components/MolstarViewer";
import PDBUpload from "./components/PDBUpload";
import SequenceCard from "./components/SequenceCard";
import type { StructureMetadata } from "./types";

type SelectedResidue = { chainId: string; seqId: number };

export default function App() {
  const [structure, setStructure] = useState<StructureMetadata | null>(null);
  const [pdbFile, setPdbFile] = useState<File | null>(null);
  const [selectedResidue, setSelectedResidue] = useState<SelectedResidue | null>(null);

  function handleUploadSuccess(metadata: StructureMetadata, file: File) {
    setSelectedResidue(null);
    setStructure(metadata);
    setPdbFile(file);
  }

  function handleResidueClick(chainId: string, seqId: number) {
    setSelectedResidue(prev =>
      prev?.chainId === chainId && prev.seqId === seqId
        ? null
        : { chainId, seqId }
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">moleculeSuite</h1>
        <p className="app-subtitle">Protein biochemistry visualisation</p>
      </header>

      <main className="app-main">
        <PDBUpload onUploadSuccess={handleUploadSuccess} structure={structure} />
        {structure && (
          <SequenceCard
            chains={structure.chains}
            selectedResidue={selectedResidue}
            onResidueClick={handleResidueClick}
          />
        )}
        <MolstarViewer structure={structure} pdbFile={pdbFile} selectedResidue={selectedResidue} />
      </main>
    </div>
  );
}
