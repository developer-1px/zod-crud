import { useMemo, useState } from "react";
import { SourceTabs } from "../code/SourceTabs";
import { packageSources } from "./source-registry";

// 4 pillars (메모리 정본) ↔ verb 파일 매핑. Annotation only — 폴더는 그대로.
const PILLAR: Record<string, { label: string; tone: string }> = {
  "verbs/select.ts":    { label: "Selection", tone: "bg-sky-100 text-sky-800" },
  "verbs/find.ts":      { label: "Selection", tone: "bg-sky-100 text-sky-800" },
  "verbs/move.ts":      { label: "Edit",      tone: "bg-emerald-100 text-emerald-800" },
  "verbs/duplicate.ts": { label: "Edit",      tone: "bg-emerald-100 text-emerald-800" },
  "verbs/replace.ts":   { label: "Edit",      tone: "bg-emerald-100 text-emerald-800" },
  "verbs/cut.ts":       { label: "Clipboard", tone: "bg-amber-100 text-amber-800" },
  "verbs/copy.ts":      { label: "Clipboard", tone: "bg-amber-100 text-amber-800" },
  "verbs/paste.ts":     { label: "Clipboard", tone: "bg-amber-100 text-amber-800" },
  "verbs/undo.ts":      { label: "Undo",      tone: "bg-rose-100 text-rose-800" },
  "verbs/redo.ts":      { label: "Undo",      tone: "bg-rose-100 text-rose-800" },
};

type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; loc: number };

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { kind: "dir", name: "src", path: "", children: [] };
  for (const path of paths) {
    const segs = path.split("/");
    let cursor: TreeNode = root;
    segs.forEach((seg, i) => {
      const isFile = i === segs.length - 1;
      if (cursor.kind !== "dir") return;
      let next = cursor.children.find((c) => c.name === seg);
      if (!next) {
        if (isFile) {
          const loc = (packageSources[path] ?? "").split("\n").length;
          next = { kind: "file", name: seg, path, loc };
        } else {
          next = { kind: "dir", name: seg, path: segs.slice(0, i + 1).join("/"), children: [] };
        }
        cursor.children.push(next);
      }
      cursor = next;
    });
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  if (node.kind !== "dir") return;
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

export function ApiReference() {
  const tree = useMemo(() => buildTree(Object.keys(packageSources).sort()), []);
  const allPaths = useMemo(() => Object.keys(packageSources).sort(), []);
  const totalLoc = useMemo(
    () => allPaths.reduce((n, p) => n + (packageSources[p] ?? "").split("\n").length, 0),
    [allPaths],
  );

  const [activePath, setActivePath] = useState<string>(allPaths[0] ?? "");
  const active = activePath ? { path: activePath, source: packageSources[activePath] ?? "" } : null;

  return (
    <main className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="shrink-0 border-stone-200 bg-stone-50 md:h-full md:w-72 md:overflow-y-auto md:border-r">
        <div className="border-b border-stone-200 p-3 text-[11px] text-stone-500">
          <div className="font-mono text-stone-700">packages/zod-crud/src</div>
          <div>{allPaths.length} files · {totalLoc.toLocaleString()} LOC</div>
        </div>
        <div className="p-2">
          <Tree node={tree} activePath={activePath} onSelect={setActivePath} depth={0} />
        </div>
      </aside>

      <section className="flex flex-1 min-h-0 flex-col">
        {active && (
          <div className="border-b border-stone-200 px-4 py-2">
            <code className="block font-mono text-sm font-semibold text-stone-900">
              {active.path}
            </code>
            <div className="mt-0.5 text-[11px] text-stone-500">
              {active.source.split("\n").length} lines
              {PILLAR[active.path] && (
                <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${PILLAR[active.path]!.tone}`}>
                  {PILLAR[active.path]!.label}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-1 min-h-0 p-2">
          {active && (
            <SourceTabs
              key={active.path}
              tabs={[{ key: active.path, label: basename(active.path), filename: active.path, source: active.source }]}
              filenamePrefix="packages/zod-crud/src/"
            />
          )}
        </div>
      </section>
    </main>
  );
}

function Tree({
  node,
  activePath,
  onSelect,
  depth,
}: {
  node: TreeNode;
  activePath: string;
  onSelect: (p: string) => void;
  depth: number;
}) {
  if (node.kind === "file") {
    const current = node.path === activePath;
    const pill = PILLAR[node.path];
    return (
      <button
        onClick={() => onSelect(node.path)}
        aria-current={current ? "page" : undefined}
        className="flex w-full items-baseline gap-2 rounded px-2 py-0.5 text-left font-mono text-[12px] text-stone-700 hover:bg-stone-200 hover:text-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="flex-1 truncate">{node.name}</span>
        {pill && <span className={`shrink-0 rounded px-1 text-[9px] font-medium ${pill.tone}`}>{pill.label}</span>}
        <span className="shrink-0 text-[10px] text-stone-400 group-aria-[current=page]:text-stone-300">{node.loc}</span>
      </button>
    );
  }
  return (
    <details open className="group">
      <summary
        className="cursor-pointer list-none rounded px-2 py-0.5 font-mono text-[12px] font-medium text-stone-600 marker:hidden hover:bg-stone-100"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-stone-400">▸</span> {node.name}/
        <span className="ml-1.5 text-[10px] text-stone-400">({countFiles(node)})</span>
      </summary>
      <div>
        {node.children.map((c) => (
          <Tree key={c.path || c.name} node={c} activePath={activePath} onSelect={onSelect} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function countFiles(node: TreeNode): number {
  if (node.kind === "file") return 1;
  return node.children.reduce((n, c) => n + countFiles(c), 0);
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
