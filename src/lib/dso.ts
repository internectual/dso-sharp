// DSO header parsing + game version detection.
// Source mapping: github.com/Elletra/dso-sharp Constants.cs + Versions/GameVersion.cs

import { unzipSync, strFromU8 } from "fflate";

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
  // Torque DSO header begins with a 32-bit little-endian version.
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return v.getUint32(0, true);
}

export function identifyDso(name: string, bytes: Uint8Array): DsoFileResult {
  const version = readDsoVersion(bytes);
  if (version === null) {
    return { name, size: bytes.length, version: null, candidates: [], error: "File too small to read DSO header" };
  }
  const candidates = VERSION_MAP[version] ?? [];
  return { name, size: bytes.length, version, candidates };
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
      return [{ name: file.name, size: file.size, version: null, candidates: [], error: "No .dso files found in archive" }];
    }
    return results;
  }

  if (lower.endsWith(".dso")) {
    return [identifyDso(file.name, buf)];
  }

  return [{ name: file.name, size: file.size, version: null, candidates: [], error: "Unsupported file type. Upload a .dso or .zip file." }];
}

// Build a plaintext preview. Full decompilation (control-flow analysis, AST
// builder, code generator from dso-sharp) is not implemented in this build —
// surface the header info + a hex-style preview of the first bytes so users
// see something honest rather than a fake script.
export function buildPreview(result: DsoFileResult, bytes: Uint8Array | null): string {
  const lines: string[] = [];
  lines.push(`// File: ${result.name}`);
  lines.push(`// Size: ${result.size.toLocaleString()} bytes`);
  if (result.version !== null) {
    lines.push(`// DSO version: ${result.version}`);
  }
  if (result.candidates.length === 1) {
    lines.push(`// Game: ${GAME_NAMES[result.candidates[0]]}`);
  } else if (result.candidates.length > 1) {
    lines.push(`// Game (ambiguous): ${result.candidates.map((c) => GAME_NAMES[c]).join(" | ")}`);
  } else if (result.version !== null) {
    lines.push(`// Game: unknown (version ${result.version} not in dso-sharp map)`);
  }
  if (result.error) lines.push(`// Error: ${result.error}`);
  lines.push("");
  lines.push("// ---------------------------------------------------------------");
  lines.push("// Decompiled script output");
  lines.push("// ---------------------------------------------------------------");
  lines.push("// Full TorqueScript decompilation is not implemented in this");
  lines.push("// web port yet. Version detection runs against the dso-sharp");
  lines.push("// header map; producing readable source requires the bytecode");
  lines.push("// reader, control-flow analyzer, AST builder, and code generator");
  lines.push("// from Elletra/dso-sharp to be ported to TypeScript.");
  lines.push("");

  if (bytes && bytes.length > 0) {
    lines.push("// First 256 bytes (hex):");
    const slice = bytes.slice(0, 256);
    for (let i = 0; i < slice.length; i += 16) {
      const row = slice.slice(i, i + 16);
      const hex = Array.from(row).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const ascii = Array.from(row).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
      lines.push(`// ${i.toString(16).padStart(4, "0")}  ${hex.padEnd(48)}  ${ascii}`);
    }
  }
  return lines.join("\n");
}
