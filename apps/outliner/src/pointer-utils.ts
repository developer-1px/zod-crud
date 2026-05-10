// Outliner-local Pointer helpers. RFC 6901 위에서 outline 트리를 다루는 식별 함수들.

import type { Pointer } from "zod-crud";
import type { OutlineNode } from "./schema.js";

export function parentOf(p: Pointer): Pointer | null {
  if (p === "") return null;
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
}

export function lastIndex(p: Pointer): number | null {
  if (p === "") return null;
  const i = p.lastIndexOf("/");
  if (i < 0) return null;
  const n = Number(p.slice(i + 1));
  return Number.isInteger(n) ? n : null;
}

export function siblingAt(p: Pointer, idx: number): Pointer {
  const i = p.lastIndexOf("/");
  return p.slice(0, i + 1) + String(idx);
}

export function readNode(root: OutlineNode, pointer: Pointer): OutlineNode | null {
  if (pointer === "") return root;
  const seg = pointer.split("/").slice(1);
  let cur: OutlineNode | undefined = root;
  for (let i = 0; i < seg.length; i++) {
    const k = seg[i]!;
    if (!cur) return null;
    if (k === "children") {
      const idx = Number(seg[++i]);
      cur = cur.children[idx];
    } else if (k === "text") {
      return null;
    }
  }
  return cur ?? null;
}

export function readChildren(root: OutlineNode, pointer: Pointer): OutlineNode[] {
  const node = readNode(root, pointer);
  return node?.children ?? [];
}

// 트리를 깊이우선 순회하며 각 노드의 Pointer 를 yield. root 자신도 포함.
export function* walkPointers(root: OutlineNode, base: Pointer = ""): Generator<Pointer> {
  yield base;
  for (let i = 0; i < root.children.length; i++) {
    yield* walkPointers(root.children[i]!, `${base}/children/${i}`);
  }
}

// 두 Pointer 의 visible(DFS) 순서 비교. -1 / 0 / 1.
export function comparePointer(root: OutlineNode, a: Pointer, b: Pointer): number {
  if (a === b) return 0;
  for (const p of walkPointers(root)) {
    if (p === a) return -1;
    if (p === b) return 1;
  }
  return 0;
}

// 같은 array 부모를 공유하면 그 부모 Pointer 반환, 아니면 null.
export function sharedArrayParent(a: Pointer, b: Pointer): Pointer | null {
  const pa = parentOf(a);
  const pb = parentOf(b);
  if (pa === null || pb === null) return null;
  if (pa !== pb) return null;
  if (lastIndex(a) === null || lastIndex(b) === null) return null;
  return pa;
}
