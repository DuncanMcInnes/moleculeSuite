import { useEffect, useRef } from "react";
import { createPluginUI } from "molstar/lib/mol-plugin-ui/index";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { Color } from "molstar/lib/mol-util/color/index";
import type { StructureMetadata } from "../types";

import "molstar/build/viewer/molstar.css";

interface Props {
  structure: StructureMetadata | null;
  pdbFile: File | null;
}

export default function MolstarViewer({ pdbFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<PluginContext | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Effect 1: init plugin once on mount, dispose on unmount.
  // The `cancelled` flag is synchronous — it coordinates between the async init
  // IIFE and the cleanup closure so StrictMode double-invocation is safe.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const plugin = await createPluginUI({
        target: containerRef.current!,
        render: renderReact18,
        spec: DefaultPluginUISpec(),
      });
      if (cancelled) {
        // Cleanup already ran before init finished — dispose immediately and bail.
        plugin.dispose();
        return;
      }
      plugin.canvas3d?.setProps({ renderer: { backgroundColor: Color(0x0d1117) } });
      pluginRef.current = plugin;
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      pluginRef.current?.dispose();
      pluginRef.current = null;
    };
  }, []);

  // Effect 2: load new structure whenever pdbFile changes
  useEffect(() => {
    if (!pdbFile || !pluginRef.current) return;

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(pdbFile);
    blobUrlRef.current = url;

    (async () => {
      const plugin = pluginRef.current!;
      await plugin.clear();
      const data = await plugin.builders.data.download({ url, isBinary: false });
      const traj = await plugin.builders.structure.parseTrajectory(data, "pdb");
      await plugin.builders.structure.hierarchy.applyPreset(traj, "default");
    })();
  }, [pdbFile]);

  return (
    <div className="viewer-panel">
      {!pdbFile && (
        <div className="viewer-canvas viewer-canvas--empty">
          <p className="viewer-empty">Upload a structure to begin</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="viewer-canvas"
        style={{ display: pdbFile ? "block" : "none" }}
      />
    </div>
  );
}
