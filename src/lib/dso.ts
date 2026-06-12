// DSO header parsing, game version detection, and full decompilation entry.
// Source mapping: github.com/Elletra/dso-sharp Constants.cs + Versions/GameVersion.cs
// Full TorqueScript decompilation lives in ./decompiler.ts.

import { unzipSync } from "fflate";
import { decompile as decompileDso, isDecompileSupported } from "./decompiler";

export type GameIdentifier =
  | "TGE10"
  | "TGE14"
  | "TCON"
  | "Tribes2"
  | "ForgettableDungeon"
  | "BlocklandV1"
  | "BlocklandV20"
  | "BlocklandV21";

export const GAME_NAMES: Record<GameIdentifier, string> = {
  TGE10: "Torque Game Engine 1.0–1.3",
  TGE14: "Torque Game Engine 1.4",
  TCON: "Torque Constructor",
  Tribes2: "Tribes 2",
  ForgettableDungeon: "The Forgettable Dungeon",
  BlocklandV1: "Blockland v1",
  BlocklandV20: "Blockland v20",
  BlocklandV21: "Blockland v21",
};

// dso-sharp Constants.cs > GameVersions
const VERSION_MAP: Record<number, GameIdentifier[]> = {
  33: ["TGE10", "ForgettableDungeon"], // TGE10 and TFD share version 33
  36: ["TGE14"],
  38: ["TCON"],
  174: ["Tribes2"],
  90: ["BlocklandV1"],
  190: ["BlocklandV20"],
  210: ["BlocklandV21"],
};

export interface DsoFileResult {
  name: string;
  size: number;
  version: number | null;
  candidates: GameIdentifier[];
  bytes: Uint8Array | null;
  error?: string;
}

export function readDsoVersion(bytes: Uint8Array): number | null {
  if (bytes.length < 4) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return v.getUint32(0, true);
}

export function identifyDso(name: string, bytes: Uint8Array): DsoFileResult {
  const version = readDsoVersion(bytes);
  if (version === null) {
    return { name, size: bytes.length, version: null, candidates: [], bytes, error: "File too small to read DSO header" };
  }
  const candidates = VERSION_MAP[version] ?? [];
  return { name, size: bytes.length, version, candidates, bytes };
}

export async function processUpload(file: File): Promise<DsoFileResult[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".zip")) {
    const entries = unzipSync(buf, {
      filter: (f) => f.name.toLowerCase().endsWith(".dso"),
    });
    const results: DsoFileResult[] = [];
    for (const [name, data] of Object.entries(entries)) {
      results.push(identifyDso(name, data));
    }
    if (results.length === 0) {
      return [{ name: file.name, size: file.size, version: null, candidates: [], bytes: null, error: "No .dso files found in archive" }];
    }
    return results;
  }

  if (lower.endsWith(".dso")) {
    return [identifyDso(file.name, buf)];
  }

  return [{ name: file.name, size: file.size, version: null, candidates: [], bytes: null, error: "Unsupported file type. Upload a .dso or .zip file." }];
}

/**
 * Build the decompiled output. For supported game versions (TGE 1.0–1.3,
 * Tribes 2, The Forgettable Dungeon) this runs the full bytecode reader →
 * control-flow analyzer → AST builder → TorqueScript code generator pipeline
 * ported from dso-sharp. Other versions surface a header summary + hex
 * preview.
 */
export function buildPreview(result: DsoFileResult, bytes: Uint8Array | null): string {
  const header: string[] = [];
  header.push(`// File: ${result.name}`);
  header.push(`// Size: ${result.size.toLocaleString()} bytes`);
  if (result.version !== null) header.push(`// DSO version: ${result.version}`);
  if (result.candidates.length === 1) {
    header.push(`// Game: ${GAME_NAMES[result.candidates[0]]}`);
  } else if (result.candidates.length > 1) {
    header.push(`// Game (ambiguous): ${result.candidates.map((c) => GAME_NAMES[c]).join(" | ")}`);
  } else if (result.version !== null) {
    header.push(`// Game: unknown (version ${result.version} not in dso-sharp map)`);
  }
  if (result.error) header.push(`// Error: ${result.error}`);
  header.push("");

  const supported = result.candidates.find(isDecompileSupported);
  if (bytes && supported) {
    const out = decompileDso(bytes);
    if (out.ok && out.source !== undefined) {
      header.push("// ---------------------------------------------------------------");
      header.push(`// Decompiled TorqueScript (${out.stats?.instructionCount ?? 0} instructions, ${out.stats?.codeSize ?? 0} ops)`);
      header.push("// ---------------------------------------------------------------");
      header.push("");
      return header.join("\n") + out.source;
    }
    header.push("// ---------------------------------------------------------------");
    header.push("// Decompilation failed");
    header.push("// ---------------------------------------------------------------");
    header.push(`// ${out.error ?? "Unknown error"}`);
    header.push("");
    return header.join("\n") + renderHexPreview(bytes);
  }

  header.push("// ---------------------------------------------------------------");
  header.push("// Decompiled script output");
  header.push("// ---------------------------------------------------------------");
  if (result.candidates.length > 0) {
    header.push(`// Full decompilation isn't ported for: ${result.candidates.map((c) => GAME_NAMES[c]).join(", ")}.`);
    header.push("// Supported: TGE 1.0–1.3, Tribes 2, The Forgettable Dungeon.");
  } else {
    header.push("// Unknown DSO version — cannot decompile.");
  }
  header.push("");
  return header.join("\n") + (bytes ? renderHexPreview(bytes) : "");
}

function renderHexPreview(bytes: Uint8Array): string {
  const lines: string[] = ["// First 256 bytes (hex):"];
  const slice = bytes.slice(0, 256);
  for (let i = 0; i < slice.length; i += 16) {
    const row = slice.slice(i, i + 16);
    const hex = Array.from(row).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(row).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    lines.push(`// ${i.toString(16).padStart(4, "0")}  ${hex.padEnd(48)}  ${ascii}`);
  }
  return lines.join("\n");
}
