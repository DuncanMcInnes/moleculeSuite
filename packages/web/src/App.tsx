import { useState } from "react";
import MolstarViewer from "./components/MolstarViewer";
import PDBUpload from "./components/PDBUpload";
import type { StructureMetadata } from "./types";

export default function App() {
  const [structure, setStructure] = useState<StructureMetadata | null>(null);
  const [pdbFile, setPdbFile] = useState<File | null>(null);

  function handleUploadSuccess(metadata: StructureMetadata, file: File) {
    setStructure(metadata);
    setPdbFile(file);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">moleculeSuite</h1>
        <p className="app-subtitle">Protein biochemistry visualisation</p>
      </header>

      <main className="app-main">
        <PDBUpload onUploadSuccess={handleUploadSuccess} structure={structure} />
        <MolstarViewer structure={structure} pdbFile={pdbFile} />
      </main>
    </div>
  );
}
