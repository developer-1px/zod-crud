// Workflowy/Roam 풍 outliner — useJSONDocument facade 1개로 구현.
// schema = recursive { text, children: Self[] }. focus = 현재 활성 노드 Pointer.
// 모든 키 동작이 RFC 6902 op 1~2 개로 표현되고, history·focus 가 facade 안에 있음.

import { useEffect, useRef } from "react";
import { z } from "zod";
import { useJSONDocument, type Pointer } from "zod-crud";

type OutlineNode = { text: string; children: OutlineNode[] };

const OutlineSchema: z.ZodType<OutlineNode> = z.object({
  text: z.string(),
  get children() { return z.array(OutlineSchema); },
});

const SAMPLE: OutlineNode = {
  text: "Welcome to the outliner",
  children: [
    { text: "Enter — insert sibling after focus", children: [] },
    { text: "Tab — demote (move into prev sibling)", children: [] },
    { text: "Shift+Tab — promote (move out to parent's sibling)", children: [] },
    { text: "Backspace on empty — remove", children: [] },
    { text: "⌘Z / ⌘⇧Z — undo / redo", children: [] },
    {
      text: "Indent works recursively",
      children: [
        { text: "child A", children: [] },
        { text: "child B", children: [] },
      ],
    },
  ],
};

// Pointer helpers — 모두 RFC 6901 segment 조작.
function parentOf(p: Pointer): Pointer | null {
  if (p === "") return null;
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
}
function lastIndex(p: Pointer): number | null {
  const i = p.lastIndexOf("/");
  if (i < 0) return null;
  const n = Number(p.slice(i + 1));
  return Number.isInteger(n) ? n : null;
}
function siblingAt(p: Pointer, idx: number): Pointer {
  const i = p.lastIndexOf("/");
  return p.slice(0, i + 1) + String(idx);
}

export function Outliner() {
  const doc = useJSONDocument(OutlineSchema, SAMPLE, {
    history: 200,
    strict: false,
    selection: { mode: "single", initial: [""] },
  });
  const focus: Pointer | null = doc.selection?.focus ?? null;

  // 키 매핑 (DOM 이벤트 → RFC 6902 op) — UI 책임.
  const onKey = (e: React.KeyboardEvent, p: Pointer): void => {
    const isMeta = e.metaKey || e.ctrlKey;
    if (isMeta && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      doc.commands.undo();
      return;
    }
    if (isMeta && (e.key === "z" && e.shiftKey || e.key === "y")) {
      e.preventDefault();
      doc.commands.redo();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const idx = lastIndex(p);
      if (idx === null) return;
      const parent = parentOf(p);
      if (parent === null) return;
      const insertAt = `${parent}/${idx + 1}`;
      const r = doc.ops.patch([{ op: "add", path: insertAt, value: { text: "", children: [] } }]);
      if (r.ok) doc.selection?.collapse(insertAt);
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const idx = lastIndex(p);
      if (idx === null || idx === 0) return;
      const prev = siblingAt(p, idx - 1);
      const target = `${prev}/children/-`;
      const r = doc.ops.patch([{ op: "move", from: p, path: target }]);
      if (r.ok) {
        const prevChildren = readChildren(doc.value, prev);
        doc.selection?.collapse(`${prev}/children/${prevChildren.length}`);
      }
      return;
    }
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const parent = parentOf(p);
      if (parent === null || parent === "") return;
      const parentIdx = lastIndex(parent);
      if (parentIdx === null) return;
      const parentParent = parentOf(parent);
      if (parentParent === null) return;
      const targetIdx = parentIdx + 1;
      const target = `${parentParent}/${targetIdx}`;
      const r = doc.ops.patch([{ op: "move", from: p, path: target }]);
      if (r.ok) doc.selection?.collapse(target);
      return;
    }
    if (e.key === "Backspace") {
      const text = readText(doc.value, p);
      if (text === "") {
        e.preventDefault();
        const idx = lastIndex(p);
        const parent = parentOf(p);
        if (idx === null || parent === null) return;
        const r = doc.ops.patch([{ op: "remove", path: p }]);
        if (r.ok) {
          doc.selection?.collapse(idx > 0 ? siblingAt(p, idx - 1) : parent);
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 text-xs">
        <button onClick={doc.commands.undo} disabled={!doc.history.canUndo} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">undo</button>
        <button onClick={doc.commands.redo} disabled={!doc.history.canRedo} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">redo</button>
        <button onClick={() => doc.ops.reset()} className="rounded border border-stone-300 bg-white px-2 py-1">reset</button>
        <span className="ml-auto font-mono text-stone-500">focus = {focus ?? "—"}</span>
      </div>
      <ul role="tree" aria-label="outline" className="rounded border border-stone-200 bg-white p-2 font-mono text-sm">
        <OutlineRow node={doc.value} pointer="" depth={0} focus={focus} setFocus={(p) => doc.selection?.collapse(p)} ops={doc.ops} onKey={onKey} />
      </ul>
    </div>
  );
}

interface RowProps {
  node: OutlineNode;
  pointer: Pointer;
  depth: number;
  focus: Pointer | null;
  setFocus: (p: Pointer) => void;
  ops: ReturnType<typeof useJSONDocument<typeof OutlineSchema>>["ops"];
  onKey: (e: React.KeyboardEvent, p: Pointer) => void;
}

function OutlineRow(props: RowProps) {
  const { node, pointer, depth, focus, setFocus, ops, onKey } = props;
  const textPath = `${pointer}/text`;
  const isFocused = pointer === focus;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isFocused) ref.current?.focus(); }, [isFocused]);

  return (
    <>
      <li
        role="treeitem"
        aria-selected={isFocused}
        aria-level={depth + 1}
        className="flex items-center gap-2"
        style={{ paddingLeft: `${depth * 1.25}rem` }}
        onClick={() => setFocus(pointer)}
      >
        <span aria-hidden className="select-none text-stone-400">
          {node.children.length > 0 ? "▾" : "•"}
        </span>
        <input
          ref={ref}
          value={node.text}
          onChange={(e) => ops.patch([{ op: "replace", path: textPath, value: e.target.value }])}
          onFocus={() => setFocus(pointer)}
          onKeyDown={(e) => onKey(e, pointer)}
          placeholder="(empty)"
          className={`flex-1 bg-transparent outline-none ${isFocused ? "rounded bg-sky-50 px-1" : ""}`}
        />
      </li>
      {node.children.map((child, i) => (
        <OutlineRow
          key={`${pointer}/children/${i}`}
          node={child}
          pointer={`${pointer}/children/${i}`}
          depth={depth + 1}
          focus={focus}
          setFocus={setFocus}
          ops={ops}
          onKey={onKey}
        />
      ))}
    </>
  );
}

// 비-mutation read — 직접 객체 순회 (state 가 plain JSON 이므로 헬퍼 불필요).
function readText(node: OutlineNode, pointer: Pointer): string {
  if (pointer === "") return node.text;
  const seg = pointer.split("/").slice(1);
  let cur: OutlineNode = node;
  for (let i = 0; i < seg.length; i++) {
    const k = seg[i]!;
    if (k === "text") return cur.text;
    if (k === "children") {
      const idx = Number(seg[++i]);
      if (!cur.children[idx]) return "";
      cur = cur.children[idx]!;
    }
  }
  return cur.text;
}

function readChildren(node: OutlineNode, pointer: Pointer): OutlineNode[] {
  if (pointer === "") return node.children;
  const seg = pointer.split("/").slice(1);
  let cur: OutlineNode = node;
  for (let i = 0; i < seg.length; i++) {
    const k = seg[i]!;
    if (k === "children") {
      const idx = Number(seg[++i]);
      if (!cur.children[idx]) return [];
      cur = cur.children[idx]!;
    }
  }
  return cur.children;
}
