import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { processUpload, buildPreview, GAME_NAMES, type DsoFileResult } from "@/lib/dso";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DSO Decompiler — Web" },
      {
        name: "description",
        content:
          "Upload a Torque .dso bytecode file or .zip archive to detect the game version it was compiled for and view a plaintext decompiled preview.",
      },
      { property: "og:title", content: "DSO Decompiler — Web" },
      {
        property: "og:description",
        content:
          "Web port of dso-sharp: detect Torque game version from a .dso file and view decompiled output.",
      },
    ],
  }),
  component: Index,
});

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function Index() {
  const [results, setResults] = useState<DsoFileResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await processUpload(file);
      setResults(res);
      setSelected(0);
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
  const preview = useMemo(
    () => (current ? buildPreview(current, current.bytes) : ""),
    [current],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl overflow-x-clip px-4 py-10 sm:px-6">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-accent" />
          <span>Torque bytecode tool</span>
        </div>
        <h1 className="mt-3 font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
          DSO Decompiler
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
          . Drop a <code className="font-mono text-foreground">.dso</code> file or a{" "}
          <code className="font-mono text-foreground">.zip</code> archive to detect the
          game version it was compiled for and view a plaintext decompiled preview.
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
        <input
          type="file"
          accept="*/*"
          className="sr-only"
          onChange={onInput}
        />
        <div className="font-mono text-sm text-muted-foreground">
          {busy ? "Reading…" : "Drag & drop, or click to upload"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground/70">
          .dso · .zip (processed entirely in your browser)
        </div>
      </label>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border bg-surface/60 p-3">
            <div className="px-2 pb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Archive ({results.length})
            </div>
            <div className="max-h-[60vh] overflow-auto pr-1">
              <FileTree
                results={results}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {current && <VersionCard result={current} />}
            {current && (
              <div className="overflow-hidden rounded-xl border bg-surface/60">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <div className="truncate font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {current.name}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(preview)}
                      className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => downloadText(preview, downloadName(current.name))}
                      className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                    >
                      Download
                    </button>
                  </div>
                </div>
                <pre className="max-h-[60vh] overflow-x-auto overflow-y-auto whitespace-pre px-4 py-4 font-mono text-[12.5px] leading-relaxed text-surface-foreground">
                  {preview}
                </pre>
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
        Version detection follows the header map from dso-sharp's{" "}
        <code className="font-mono">Constants.cs</code>. Full TorqueScript
        decompilation is not implemented in this build.
      </footer>
    </main>
  );
}

function VersionCard({ result }: { result: DsoFileResult }) {
  const isAmbiguous = result.candidates.length > 1;
  const isUnknown = result.version !== null && result.candidates.length === 0;
  const tone = result.error
    ? "destructive"
    : isUnknown
      ? "warning"
      : isAmbiguous
        ? "warning"
        : "accent";

  const ring =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/40 bg-warning/5"
        : "border-accent/40 bg-accent/5";

  return (
    <div className={`rounded-xl border ${ring} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Detected game
          </div>
          <div className="mt-1 font-mono text-xl font-medium">
            {result.error
              ? "—"
              : result.candidates.length === 0
                ? `Unknown (version ${result.version ?? "?"})`
                : result.candidates.map((c) => GAME_NAMES[c]).join("  ·  ")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            DSO version
          </div>
          <div className="mt-1 font-mono text-xl">
            {result.version ?? "—"}
          </div>
        </div>
      </div>
      {isAmbiguous && (
        <p className="mt-3 text-xs text-muted-foreground">
          Multiple games share this header version. dso-sharp tries each candidate's
          opcode table during decompilation to disambiguate.
        </p>
      )}
      {result.error && (
        <p className="mt-3 text-xs text-destructive">{result.error}</p>
      )}
    </div>
  );
}

function downloadName(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.toLowerCase().endsWith(".dso") ? base.slice(0, -4) : `${base}.txt`;
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

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  fileIndex?: number;
  result?: DsoFileResult;
}

function buildTree(results: DsoFileResult[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  results.forEach((r, idx) => {
    const parts = r.name.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: new Map() };
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
}: {
  results: DsoFileResult[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const root = useMemo(() => buildTree(results), [results]);
  return (
    <ul className="font-mono text-xs">
      {Array.from(root.children.values()).map((c) => (
        <TreeNodeView key={c.path} node={c} depth={0} selected={selected} onSelect={onSelect} />
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
            <TreeNodeView key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
