// DSO header parsing, game version detection, and full decompilation entry.
// Source mapping: github.com/Elletra/dso-sharp Constants.cs + Versions/GameVersion.cs
// Full TorqueScript decompilation lives in ./decompiler.ts.

import { unzipSync } from "fflate";
import { decompile as decompileDso, disassembleText, isDecompileSupported } from "./decompiler";

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

  // Single .dso file
  if (lower.endsWith(".dso")) {
    return [identifyDso(file.name, buf)];
  }

  // Anything else: assume zip archive and surface every entry in a tree.
  try {
    const entries = unzipSync(buf);
    const results: DsoFileResult[] = [];
    for (const [name, data] of Object.entries(entries)) {
      // Skip directory entries (zip stores them with trailing slash, empty data)
      if (name.endsWith("/")) continue;
      if (name.toLowerCase().endsWith(".dso")) {
        results.push(identifyDso(name, data));
      } else {
        results.push({
          name,
          size: data.length,
          version: null,
          candidates: [],
          bytes: data,
          error: "Not a .dso file",
        });
      }
    }
    if (results.length === 0) {
      return [{ name: file.name, size: file.size, version: null, candidates: [], bytes: null, error: "Archive contained no files" }];
    }
    return results;
  } catch (e) {
    return [{
      name: file.name,
      size: file.size,
      version: null,
      candidates: [],
      bytes: null,
      error: `Could not read as .dso or as a zip archive: ${e instanceof Error ? e.message : String(e)}`,
    }];
  }
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

/* ────────────────────────────────────────────────────────────────────────── *
 * File kind detection and content extraction
 * ────────────────────────────────────────────────────────────────────────── */
export type FileKind =
  | { kind: "dso" }
  | { kind: "image"; mime: string }
  | { kind: "text"; language: string }
  | { kind: "binary" };

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

const TEXT_LANG: Record<string, string> = {
  cs: "cpp",
  gui: "cpp",
  mis: "cpp",
  cpp: "cpp",
  c: "cpp",
  h: "cpp",
  hpp: "cpp",
  js: "javascript",
  ts: "typescript",
  json: "json",
  xml: "markup",
  html: "markup",
  css: "css",
  md: "markdown",
  txt: "plain",
  log: "plain",
  ini: "ini",
  cfg: "ini",
};

function extOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  // Strip a single trailing .dso to inspect the inner extension (e.g. console.cs.dso → cs.dso)
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot + 1) : "";
}

export function detectFileKind(name: string): FileKind {
  const ext = extOf(name);
  if (ext === "dso") return { kind: "dso" };
  if (IMAGE_MIME[ext]) return { kind: "image", mime: IMAGE_MIME[ext] };
  if (TEXT_LANG[ext]) return { kind: "text", language: TEXT_LANG[ext] };
  return { kind: "binary" };
}

/** Heuristic: returns true if a buffer looks like printable text. */
function looksLikeText(bytes: Uint8Array): boolean {
  const len = Math.min(bytes.length, 4096);
  if (len === 0) return false;
  let printable = 0;
  for (let i = 0; i < len; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
  }
  return printable / len > 0.85;
}

export function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
}

export function effectiveFileKind(name: string, bytes: Uint8Array | null): FileKind {
  const k = detectFileKind(name);
  if (k.kind !== "binary" || !bytes) return k;
  if (looksLikeText(bytes)) return { kind: "text", language: "plain" };
  return k;
}

/** Build only the decompiled-script text (without the header comments). */
export function buildDecompiledOnly(result: DsoFileResult, bytes: Uint8Array | null): { ok: boolean; text: string } {
  const supported = result.candidates.find(isDecompileSupported);
  if (!bytes || !supported) {
    return { ok: false, text: bytes ? renderHexPreview(bytes) : "" };
  }
  const out = decompileDso(bytes);
  if (out.ok && out.source !== undefined) return { ok: true, text: out.source };
  return { ok: false, text: `// Decompilation failed: ${out.error ?? "unknown error"}\n\n${renderHexPreview(bytes)}` };
}

export function buildDisassembly(bytes: Uint8Array | null): { ok: boolean; text: string } {
  if (!bytes) return { ok: false, text: "" };
  const out = disassembleText(bytes);
  if (out.ok && out.text) return { ok: true, text: out.text };
  return { ok: false, text: `; Disassembly failed: ${out.error ?? "unknown error"}` };
}

