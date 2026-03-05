import { useRef, useState, DragEvent } from "react";
import type { StructureMetadata } from "../types";

interface Props {
  onUploadSuccess: (metadata: StructureMetadata) => void;
}

export default function PDBUpload({ onUploadSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function acceptFile(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdb")) {
      setError("Only .pdb files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files[0]);
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/structures/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Upload failed");
      onUploadSuccess(data as StructureMetadata);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="upload-panel">
      <p className="panel-title">Load Structure</p>

      {/* Drop zone */}
      <div
        className={`drop-zone${dragOver ? " drop-zone--active" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdb"
          className="visually-hidden"
          onChange={(e) => acceptFile(e.target.files?.[0])}
        />
        {file ? (
          <p className="drop-zone__filename">{file.name}</p>
        ) : (
          <>
            <p className="drop-zone__cta">Drop a .pdb file here</p>
            <p className="drop-zone__sub">or click to browse</p>
          </>
        )}
      </div>

      {error && <p className="error-msg">{error}</p>}

      <button
        className="btn-primary"
        disabled={!file || loading}
        onClick={handleUpload}
      >
        {loading ? "Parsing…" : "Upload & Parse"}
      </button>
    </div>
  );
}
