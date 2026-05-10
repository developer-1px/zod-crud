// Outliner-local Pointer helpers. RFC 6901 위에서 outline 트리를 다루는 식별 함수들.

import { parentPointer, lastSegmentIndex, withLastSegment, type Pointer } from "zod-crud";
import type { OutlineNode } from "./schema.js";

// Outliner-local 별칭 — zod-crud 의 path arithmetic 헬퍼를 짧은 이름으로.
export const parentOf = parentPointer;
export const lastIndex = lastSegmentIndex;
export function siblingAt(p: Pointer, idx: number): Pointer {
  return withLastSegment(p, idx) ?? p;
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

// DFS visible-order traversal — 위/아래 한 칸 이동의 정의.
// root 자신은 visible 에서 제외 (편집 row 가 아님).
function flatVisible(root: OutlineNode): Pointer[] {
  return [...walkPointers(root)].filter((p) => p !== "");
}

export function nextVisible(root: OutlineNode, pointer: Pointer): Pointer | null {
  const arr = flatVisible(root);
  if (arr.length === 0) return null;
  if (pointer === "") return arr[0]!;
  const i = arr.indexOf(pointer);
  if (i < 0) return null;
  return i + 1 < arr.length ? arr[i + 1]! : null;
}

export function prevVisible(root: OutlineNode, pointer: Pointer): Pointer | null {
  const arr = flatVisible(root);
  if (arr.length === 0) return null;
  if (pointer === "") return null;
  const i = arr.indexOf(pointer);
  if (i <= 0) return null;
  return arr[i - 1]!;
}

export function firstVisible(root: OutlineNode): Pointer | null {
  for (const p of walkPointers(root)) if (p !== "") return p;
  return null;
}

export function lastVisible(root: OutlineNode): Pointer | null {
  let last: Pointer | null = null;
  for (const p of walkPointers(root)) if (p !== "") last = p;
  return last;
}

export function firstChildOf(root: OutlineNode, pointer: Pointer): Pointer | null {
  const node = readNode(root, pointer);
  if (!node || node.children.length === 0) return null;
  return `${pointer}/children/0`;
}
