import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlight, themes, type PrismTheme } from "prism-react-renderer";
import {
  processUpload,
  GAME_NAMES,
  effectiveFileKind,
  bytesToText,
  buildDecompiledOnly,
  buildDisassembly,
  type DsoFileResult,
  type FileKind,
} from "@/lib/dso";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TURD — Torque Universal Resource Decompiler" },
      {
        name: "description",
        content:
          "Upload a Torque .dso bytecode file or .zip archive to detect the game version and view decompiled TorqueScript with syntax highlighting.",
      },
      { property: "og:title", content: "TURD — Torque Universal Resource Decompiler" },
      {
        property: "og:description",
        content:
          "Web port of dso-sharp: detect Torque game version, view decompiled TorqueScript, browse archive contents, and inspect disassembly.",
      },
    ],
  }),
  component: Index,
});


function useSystemDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Mirror onto <html> so .dark utilities work too
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return dark;
}

function Index() {
  const isDark = useSystemDark();
  const [results, setResults] = useState<DsoFileResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyDso, setOnlyDso] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await processUpload(file);
      setResults(res);
      setSelected(0);
      setOnlyDso(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read file");
      setResults([]);
    } finally {
      setBusy(false);
    }
  }, []);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const current = results[selected];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl overflow-x-clip px-4 py-10 sm:px-6">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-accent" />
          <span>Torque Universal Resource Decompiler</span>
        </div>
        <h1 className="mt-3 font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
          TURD
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Web port of{" "}
          <a
            href="https://github.com/Elletra/dso-sharp"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-4 hover:underline"
          >
            Elletra/dso-sharp
          </a>
          . Drop a <code className="font-mono text-foreground">.dso</code> file or any
          archive (zip, etc.) to detect the game version it was compiled for and view
          decompiled output.
        </p>
      </header>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-surface/60 px-6 py-12 text-center transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"
        }`}
      >
        <input type="file" accept="*/*" className="sr-only" onChange={onInput} />
        <div className="font-mono text-sm text-muted-foreground">
          {busy ? "Reading…" : "Drag & drop, or click to upload"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground/70">
          .dso · zip archive (processed entirely in your browser)
        </div>
      </label>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-surface/60 p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Archive ({results.length})
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={onlyDso}
                  onChange={(e) => setOnlyDso(e.target.checked)}
                  className="size-3 accent-current"
                />
                .dso only
              </label>
            </div>
            <div className="max-h-[60vh] overflow-auto pr-1">
              <FileTree
                results={results}
                selected={selected}
                onSelect={setSelected}
                onlyDso={onlyDso}
              />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {current && <VersionCard result={current} />}
            {current && <PreviewPane result={current} isDark={isDark} />}
          </div>
        </section>
      )}

      <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
        Version detection follows the header map from dso-sharp's{" "}
        <code className="font-mono">Constants.cs</code>. Decompilation supported for
        TGE 1.0–1.3, Tribes 2, and The Forgettable Dungeon.
      </footer>
    </main>
  );
}

/* ────────────────────────────── Preview pane ─────────────────────────────── */

type TabId = "decompiled" | "disasm" | "raw";

function PreviewPane({ result, isDark }: { result: DsoFileResult; isDark: boolean }) {
  const kind = useMemo<FileKind>(
    () => effectiveFileKind(result.name, result.bytes),
    [result],
  );

  // Image preview
  if (kind.kind === "image" && result.bytes) {
    return <ImagePane result={result} mime={kind.mime} />;
  }

  // Audio / video preview
  if (kind.kind === "media" && result.bytes) {
    return <MediaPane result={result} mime={kind.mime} media={kind.media} />;
  }


  if (kind.kind === "text") {
    const text = result.bytes ? bytesToText(result.bytes) : "";
    const lang = kind.language === "plain" ? "" : kind.language;
    return (
      <CodePane
        title={result.name}
        filename={downloadName(result.name)}
        tabs={[{ id: "raw", label: "Content", text, language: lang }]}
        isDark={isDark}
      />
    );
  }

  if (kind.kind === "dso") {
    const decompiled = buildDecompiledOnly(result, result.bytes);
    const disasm = buildDisassembly(result.bytes);
    const tabs: TabDef[] = [
      {
        id: "decompiled",
        label: "Decompiled",
        text: decompiled.text,
        language: "cpp",
      },
      { id: "disasm", label: "Disassembly", text: disasm.text, language: "" },
    ];
    return (
      <CodePane
        title={result.name}
        filename={downloadName(result.name)}
        tabs={tabs}
        isDark={isDark}
      />
    );
  }

  // Binary fallback — show a short hex dump
  const hex = result.bytes ? renderHexFull(result.bytes) : "(no content)";
  return (
    <CodePane
      title={result.name}
      filename={downloadName(result.name) + ".hex"}
      tabs={[{ id: "raw", label: "Hex", text: hex, language: "" }]}
      isDark={isDark}
    />
  );
}

interface TabDef {
  id: TabId;
  label: string;
  text: string;
  language: string;
}

function CodePane({
  title,
  filename,
  tabs,
  isDark,
}: {
  title: string;
  filename: string;
  tabs: TabDef[];
  isDark: boolean;
}) {
  const [active, setActive] = useState<TabId>(tabs[0].id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const downloadFile = (text: string, name: string) => downloadText(text, name);
  return (
    <div className="overflow-hidden rounded-xl border bg-surface/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <div className="mr-2 truncate font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {title}
          </div>
          {tabs.length > 1 &&
            tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  active === t.id
                    ? "bg-accent/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(tab.text)}
            className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          >
            Copy
          </button>
          <button
            onClick={() =>
              downloadFile(
                tab.text,
                tab.id === "disasm" ? filename + ".disasm" : filename,
              )
            }
            className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
          >
            Download
          </button>
        </div>
      </div>
      <CodeView text={tab.text} language={tab.language} isDark={isDark} />
    </div>
  );
}

function CodeView({
  text,
  language,
  isDark,
}: {
  text: string;
  language: string;
  isDark: boolean;
}) {
  const theme: PrismTheme = isDark ? themes.vsDark : themes.vsLight;
  const lang = (language || "text") as "cpp" | "text";
  return (
    <div
      className="max-h-[70vh] w-full max-w-full overflow-auto font-mono text-[12.5px] leading-relaxed"
      style={{ background: theme.plain.backgroundColor }}
    >
      <Highlight theme={theme} code={text} language={lang}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={className + " m-0 min-w-max px-0 py-3"}
            style={{ ...style, background: "transparent" }}
          >
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              return (
                <div
                  key={i}
                  {...lineProps}
                  className={lineProps.className + " flex"}
                >
                  <span
                    aria-hidden
                    className="sticky left-0 mr-3 inline-block w-12 shrink-0 select-none border-r border-border/60 pr-2 text-right text-muted-foreground/60"
                    style={{ background: theme.plain.backgroundColor }}
                  >
                    {i + 1}
                  </span>
                  <span className="whitespace-pre pl-3 pr-6">
                    {line.length === 0 || (line.length === 1 && line[0].empty) ? (
                      <span> </span>
                    ) : (
                      line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))
                    )}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function ImagePane({ result, mime }: { result: DsoFileResult; mime: string }) {
  const urlRef = useRef<string | null>(null);
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!result.bytes) return;
    const blob = new Blob([result.bytes as BlobPart], { type: mime });
    const u = URL.createObjectURL(blob);
    urlRef.current = u;
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      urlRef.current = null;
    };
  }, [result, mime]);

  const download = () => {
    if (!result.bytes) return;
    const blob = new Blob([result.bytes as BlobPart], { type: mime });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = (result.name.split("/").pop() ?? result.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-surface/60">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="truncate font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {result.name} · {mime}
        </div>
        <button
          onClick={download}
          className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
        >
          Download
        </button>
      </div>
      <div className="flex max-h-[70vh] items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4">
        {url && (
          <img
            src={url}
            alt={result.name}
            className="max-w-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        )}
      </div>
    </div>
  );
}

function renderHexFull(bytes: Uint8Array): string {
  const lines: string[] = [];
  const max = Math.min(bytes.length, 4096);
  for (let i = 0; i < max; i += 16) {
    const row = bytes.slice(i, i + 16);
    const hex = Array.from(row).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(row)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${i.toString(16).padStart(8, "0")}  ${hex.padEnd(48)}  ${ascii}`);
  }
  if (bytes.length > max) {
    lines.push(`… (${bytes.length - max} more bytes)`);
  }
  return lines.join("\n");
}

/* ──────────────────────────── Version card ──────────────────────────────── */

function VersionCard({ result }: { result: DsoFileResult }) {
  const isAmbiguous = result.candidates.length > 1;
  const isUnknown = result.version !== null && result.candidates.length === 0;
  const tone = result.error
    ? "destructive"
    : isUnknown
      ? "warning"
      : isAmbiguous
        ? "warning"
        : result.version === null
          ? "muted"
          : "accent";

  const ring =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/40 bg-warning/5"
        : tone === "muted"
          ? "border-border bg-muted/30"
          : "border-accent/40 bg-accent/5";

  return (
    <div className={`rounded-xl border ${ring} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Detected game
          </div>
          <div className="mt-1 font-mono text-xl font-medium">
            {result.version === null
              ? "—"
              : result.candidates.length === 0
                ? `Unknown (version ${result.version})`
                : result.candidates.map((c) => GAME_NAMES[c]).join("  ·  ")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            DSO version
          </div>
          <div className="mt-1 font-mono text-xl">{result.version ?? "—"}</div>
        </div>
      </div>
      {isAmbiguous && (
        <p className="mt-3 text-xs text-muted-foreground">
          Multiple games share this header version. dso-sharp tries each candidate's
          opcode table during decompilation to disambiguate.
        </p>
      )}
      {result.error && (
        <p className="mt-3 text-xs text-muted-foreground">{result.error}</p>
      )}
    </div>
  );
}

function downloadName(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.toLowerCase().endsWith(".dso") ? base.slice(0, -4) : base;
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─────────────────────────────── File tree ──────────────────────────────── */

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  fileIndex?: number;
  result?: DsoFileResult;
}

function buildTree(results: DsoFileResult[], onlyDso: boolean): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  results.forEach((r, idx) => {
    if (onlyDso && !r.name.toLowerCase().endsWith(".dso")) return;
    const parts = r.name.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
        };
        node.children.set(part, child);
      }
      node = child;
    });
    node.fileIndex = idx;
    node.result = r;
  });
  return root;
}

function FileTree({
  results,
  selected,
  onSelect,
  onlyDso,
}: {
  results: DsoFileResult[];
  selected: number;
  onSelect: (i: number) => void;
  onlyDso: boolean;
}) {
  const root = useMemo(() => buildTree(results, onlyDso), [results, onlyDso]);
  const empty = root.children.size === 0;
  if (empty) {
    return (
      <div className="px-2 py-3 font-mono text-xs text-muted-foreground">
        No .dso files in archive.
      </div>
    );
  }
  return (
    <ul className="font-mono text-xs">
      {Array.from(root.children.values()).map((c) => (
        <TreeNodeView
          key={c.path}
          node={c}
          depth={0}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function TreeNodeView({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const isFile = node.fileIndex !== undefined;
  const isSelected = isFile && node.fileIndex === selected;
  const pad = { paddingLeft: `${depth * 12 + 6}px` };

  if (isFile) {
    const r = node.result!;
    return (
      <li>
        <button
          onClick={() => onSelect(node.fileIndex!)}
          style={pad}
          className={`flex w-full items-center justify-between rounded-md py-1 pr-2 text-left transition-colors ${
            isSelected
              ? "bg-accent/15 text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
          title={r.error ?? ""}
        >
          <span className="truncate">
            <span className="mr-1 text-muted-foreground/60">·</span>
            {node.name}
          </span>
          <span className="ml-2 shrink-0 text-[10px] text-muted-foreground/70">
            {r.version !== null ? `v${r.version}` : ""}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        style={pad}
        className="flex w-full items-center gap-1 rounded-md py-1 text-left text-muted-foreground hover:text-foreground"
      >
        <span className="inline-block w-3 text-[10px]">{open ? "▾" : "▸"}</span>
        <span className="truncate">{node.name}/</span>
      </button>
      {open && (
        <ul>
          {Array.from(node.children.values()).map((c) => (
            <TreeNodeView
              key={c.path}
              node={c}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
