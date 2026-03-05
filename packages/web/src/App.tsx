import { useState } from "react";
import MolstarViewer from "./components/MolstarViewer";
import PDBUpload from "./components/PDBUpload";
import type { StructureMetadata } from "./types";

export default function App() {
  const [structure, setStructure] = useState<StructureMetadata | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">moleculeSuite</h1>
        <p className="app-subtitle">Protein biochemistry visualisation</p>
      </header>

      <main className="app-main">
        <PDBUpload onUploadSuccess={setStructure} />
        <MolstarViewer structure={structure} />
      </main>
    </div>
  );
}
