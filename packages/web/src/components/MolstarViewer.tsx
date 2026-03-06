import { useEffect, useRef, useState } from "react";
import { createPluginUI } from "molstar/lib/mol-plugin-ui/index";
import { renderReact18 } from "molstar/lib/mol-plugin-ui/react18";
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { Color } from "molstar/lib/mol-util/color/index";
import type { StructureMetadata } from "../types";

import "molstar/build/viewer/molstar.css";

type ReprType = "cartoon" | "ball-and-stick" | "gaussian-surface";
type ColorTheme = "chain-id" | "element-symbol" | "uncertainty" | "sequence-id";

interface Props {
  structure: StructureMetadata | null;
  pdbFile: File | null;
}

const REPR_OPTIONS: { value: ReprType; label: string }[] = [
  { value: "cartoon",          label: "Cartoon" },
  { value: "ball-and-stick",   label: "Ball & Stick" },
  { value: "gaussian-surface", label: "Surface" },
];

const COLOR_OPTIONS: { value: ColorTheme; label: string }[] = [
  { value: "chain-id",       label: "By Chain" },
  { value: "element-symbol", label: "By Element" },
  { value: "uncertainty",    label: "By B-factor" },
  { value: "sequence-id",    label: "Rainbow" },
];

export default function MolstarViewer({ pdbFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pluginRef    = useRef<PluginContext | null>(null);
  const blobUrlRef   = useRef<string | null>(null);

  const [reprType,   setReprType]   = useState<ReprType>("cartoon");
  const [colorTheme, setColorTheme] = useState<ColorTheme>("chain-id");

  // Refs so loadStructure always reads the current values without stale closures
  const reprRef  = useRef(reprType);
  const colorRef = useRef(colorTheme);

  // Effect 1: init plugin once on mount, dispose on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const plugin = await createPluginUI({
        target: containerRef.current!,
        render: renderReact18,
        spec: {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: false,
              regionState: {
                top:    "hidden",
                bottom: "hidden",
                left:   "hidden",
                right:  "hidden",
              },
            },
          },
        },
      });
      if (cancelled) {
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

  // Effect 2: load new structure whenever pdbFile changes; reset controls.
  useEffect(() => {
    if (!pdbFile) return;

    // Reset controls to defaults on new file
    reprRef.current  = "cartoon";
    colorRef.current = "chain-id";
    setReprType("cartoon");
    setColorTheme("chain-id");

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const url = URL.createObjectURL(pdbFile);
    blobUrlRef.current = url;

    loadStructure(url, "cartoon", "chain-id");
  }, [pdbFile]);

  async function loadStructure(url: string, repr: ReprType, color: ColorTheme) {
    const plugin = pluginRef.current;
    if (!plugin) return;

    await plugin.clear();
    const data      = await plugin.builders.data.download({ url, isBinary: false });
    const traj      = await plugin.builders.structure.parseTrajectory(data, "pdb");
    const model     = await plugin.builders.structure.createModel(traj);
    const structure = await plugin.builders.structure.createStructure(model);
    const component = await plugin.builders.structure.tryCreateComponentStatic(structure, "all");
    if (!component) return;
    await plugin.builders.structure.representation.addRepresentation(component, {
      type:  repr,
      color: color,
    });
  }

  async function handleReprChange(repr: ReprType) {
    reprRef.current = repr;
    setReprType(repr);
    if (!blobUrlRef.current) return;
    await loadStructure(blobUrlRef.current, repr, colorRef.current);
  }

  async function handleColorChange(color: ColorTheme) {
    colorRef.current = color;
    setColorTheme(color);
    const plugin = pluginRef.current;
    if (!plugin) return;
    const structures = plugin.managers.structure.hierarchy.current.structures;
    if (!structures.length) return;
    await plugin.managers.structure.component.updateRepresentationsTheme(
      structures[0].components,
      { color }
    );
  }

  return (
    <div className="viewer-panel">
      {pdbFile && (
        <>
          <div className="repr-controls">
            {REPR_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                className={`repr-btn${reprType === value ? " repr-btn--active" : ""}`}
                onClick={() => handleReprChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="repr-controls">
            {COLOR_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                className={`repr-btn${colorTheme === value ? " repr-btn--active" : ""}`}
                onClick={() => handleColorChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

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
