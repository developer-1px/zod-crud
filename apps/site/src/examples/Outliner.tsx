// Workflowy/Roam 풍 outliner — RFC 6902 op + useJson + useFocus 만으로 구현.
// schema = recursive { text, children: Self[] }. focus = 현재 활성 노드 Pointer.
// 모든 키 동작이 RFC 6902 op 1~2 개로 표현됨.

import { useEffect, useRef } from "react";
import { z } from "zod";
import { useJson, useFocus, type Pointer } from "zod-crud";

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
  const [json, ops] = useJson(OutlineSchema, SAMPLE, { history: 200, strict: false });
  const fcs = useFocus(ops, { initial: "" });
  const focus: Pointer | null = fcs.value;

  // 인라인 편집은 contentEditable 로 — text 만 path-direct replace.
  // 키 매핑은 input 자체 onKeyDown 에서 처리 (DOM 이벤트는 사용자 책임 — SPEC §8).
  const onKey = (e: React.KeyboardEvent, p: Pointer): void => {
    const isMeta = e.metaKey || e.ctrlKey;
    if (isMeta && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      ops.undo();
      return;
    }
    if (isMeta && (e.key === "z" && e.shiftKey || e.key === "y")) {
      e.preventDefault();
      ops.redo();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // 같은 부모 array 의 focus 다음 위치에 새 형제 추가
      const idx = lastIndex(p);
      if (idx === null) return;            // root 에는 sibling 없음
      const parent = parentOf(p);
      if (parent === null) return;
      const insertAt = `${parent}/${idx + 1}`;
      const r = ops.patch([{ op: "add", path: insertAt, value: { text: "", children: [] } }]);
      if (r.ok) fcs.set(insertAt);
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      // demote: focus → prev sibling 의 children 끝
      const idx = lastIndex(p);
      if (idx === null || idx === 0) return;
      const prev = siblingAt(p, idx - 1);
      const target = `${prev}/children/-`;
      const r = ops.patch([{ op: "move", from: p, path: target }]);
      if (r.ok) {
        const prevChildren = readChildren(json, prev);
        fcs.set(`${prev}/children/${prevChildren.length}`);
      }
      return;
    }
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      // promote: parent 의 sibling-after 로 이동. parent 가 root 이면 무시.
      const parent = parentOf(p);
      if (parent === null || parent === "") return;
      // parent 의 형식: ".../children/<idx>". parent 의 부모 = ".../children" 또는 root
      const parentIdx = lastIndex(parent);
      if (parentIdx === null) return;
      const parentParent = parentOf(parent);
      if (parentParent === null) return;
      const targetIdx = parentIdx + 1;
      const target = `${parentParent}/${targetIdx}`;
      const r = ops.patch([{ op: "move", from: p, path: target }]);
      if (r.ok) fcs.set(target);
      return;
    }
    if (e.key === "Backspace") {
      const text = readText(json, p);
      if (text === "") {
        e.preventDefault();
        // empty 면 제거. focus 는 prev sibling 또는 parent 로 이동.
        const idx = lastIndex(p);
        const parent = parentOf(p);
        if (idx === null || parent === null) return;
        const r = ops.patch([{ op: "remove", path: p }]);
        if (r.ok) {
          fcs.set(idx > 0 ? siblingAt(p, idx - 1) : parent);
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 text-xs">
        <button onClick={ops.undo} disabled={!ops.canUndo()} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">undo</button>
        <button onClick={ops.redo} disabled={!ops.canRedo()} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">redo</button>
        <button onClick={() => ops.reset()} className="rounded border border-stone-300 bg-white px-2 py-1">reset</button>
        <span className="ml-auto font-mono text-stone-500">focus = {focus ?? "—"}</span>
      </div>
      <ul role="tree" aria-label="outline" className="rounded border border-stone-200 bg-white p-2 font-mono text-sm">
        <OutlineRow node={json} pointer="" depth={0} focus={focus} fcs={fcs} ops={ops} onKey={onKey} />
      </ul>
    </div>
  );
}

interface RowProps {
  node: OutlineNode;
  pointer: Pointer;
  depth: number;
  focus: Pointer | null;
  fcs: ReturnType<typeof useFocus<OutlineNode>>;
  ops: ReturnType<typeof useJson<typeof OutlineSchema>>[1];
  onKey: (e: React.KeyboardEvent, p: Pointer) => void;
}

function OutlineRow(props: RowProps) {
  const { node, pointer, depth, focus, fcs, ops, onKey } = props;
  const textPath = `${pointer}/text` as never;
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
        onClick={() => fcs.set(pointer)}
      >
        <span aria-hidden className="select-none text-stone-400">
          {node.children.length > 0 ? "▾" : "•"}
        </span>
        <input
          ref={ref}
          value={node.text}
          onChange={(e) => ops.patch([{ op: "replace", path: textPath, value: e.target.value }])}
          onFocus={() => fcs.set(pointer)}
          onKeyDown={(e) => onKey(e, pointer)}
          placeholder="(empty)"
          className={`flex-1 bg-transparent outline-none ${isFocused ? "rounded bg-sky-50 px-1" : ""}`}
        />
      </li>
      {node.children.map((child, i) => (
        <OutlineRow
          key={`${pointer}/children/${i}`}
          node={child}
          pointer={`${pointer}/children/${i}` as never}
          depth={depth + 1}
          focus={focus}
          fcs={fcs}
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
