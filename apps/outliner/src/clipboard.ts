// Outliner adapter clipboard buffer for product-specific sibling/child paste policy.
// zod-crud owns the headless JSON clipboard API; this demo maps UI clipboard
// semantics to JSON Patch locally.

import { useCallback, useState } from "react";
import type { JSONDocument, Pointer, JSONResult } from "zod-crud";
import type { OutlineNode } from "./schema.js";
import { readNode, parentOf, lastIndex } from "./pointer-utils.js";

export type ClipboardMode = "empty" | "copy" | "cut";

export interface ClipboardSnapshot {
  mode: ClipboardMode;
  values: ReadonlyArray<OutlineNode>;
  sources: ReadonlyArray<Pointer>;
}

export type PasteMode = "sibling" | "child";

export interface ClipboardApi {
  mode: ClipboardMode;
  values: ReadonlyArray<OutlineNode>;
  sources: ReadonlyArray<Pointer>;
  copy(state: OutlineNode, sources: ReadonlyArray<Pointer>): void;
  cut(state: OutlineNode, sources: ReadonlyArray<Pointer>): void;
  paste(target: Pointer, mode: PasteMode, document: Pick<JSONDocument<OutlineNode>, "patch">): JSONResult;
  clear(): void;
}

const EMPTY: ClipboardSnapshot = { mode: "empty", values: [], sources: [] };

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// target Pointer 와 paste mode 로 N 개 sources 를 어떤 위치에 add/move 할지 계산.
function expandTargets(target: Pointer, mode: PasteMode, count: number): Pointer[] {
  if (count === 0) return [];

  // sibling: target 다음 형제로. /-/0/1/...
  // child: target/children/끝.
  if (mode === "child") {
    const childrenBase = `${target}/children`;
    return Array.from({ length: count }, () => `${childrenBase}/-`);
  }

  // sibling: target 의 다음 인덱스부터. target 이 root("") 이면 child 모드로 fallback.
  if (target === "") {
    return Array.from({ length: count }, () => "/children/-");
  }
  const parent = parentOf(target);
  const idx = lastIndex(target);
  if (parent === null || idx === null) {
    return Array.from({ length: count }, () => `${target}/children/-`);
  }
  // RFC 6902 sequential semantics: 매 add 마다 뒤가 밀려나므로 항상 같은 위치에 add 하면 역순으로 쌓임.
  // 우리는 sources 순서대로 target+1, target+2, ... 가 되길 원함 → 인덱스를 한 번에 계산.
  return Array.from({ length: count }, (_, i) => `${parent}/${idx + 1 + i}`);
}

export function useClipboard(): ClipboardApi {
  const [snap, setSnap] = useState<ClipboardSnapshot>(EMPTY);

  const copy = useCallback((state: OutlineNode, sources: ReadonlyArray<Pointer>) => {
    const values: OutlineNode[] = [];
    for (const p of sources) {
      const node = readNode(state, p);
      if (node) values.push(deepClone(node));
    }
    if (values.length === 0) return;
    setSnap({ mode: "copy", values, sources: [...sources] });
  }, []);

  const cut = useCallback((state: OutlineNode, sources: ReadonlyArray<Pointer>) => {
    const values: OutlineNode[] = [];
    for (const p of sources) {
      const node = readNode(state, p);
      if (node) values.push(deepClone(node));
    }
    if (values.length === 0) return;
    setSnap({ mode: "cut", values, sources: [...sources] });
  }, []);

  const paste = useCallback(
    (target: Pointer, mode: PasteMode, document: Pick<JSONDocument<OutlineNode>, "patch">): JSONResult => {
      // closure 로 잡힌 snap 이 아니라 현재 state 를 읽어야 하지만,
      // setSnap 콜백 안에서 처리하기 위해 일단 snap 로 처리 후 cut 모드면 비움.
      const cur = snap;
      if (cur.mode === "empty" || cur.values.length === 0) {
        return { ok: false, code: "path_not_found", reason: "clipboard is empty" };
      }
      const targets = expandTargets(target, mode, cur.values.length);
      // cmd.cut 이 원본을 이미 제거했으므로 paste 는 mode 무관 add 만.
      // mode = cut 일 때만 paste 후 클립보드 비움 (1회용 — Workflowy / Notion 표준).
      const batch = cur.values.map((v, i) => ({ op: "add" as const, path: targets[i] ?? target, value: deepClone(v) }));
      const r = document.patch(batch);
      if (r.ok && cur.mode === "cut") setSnap(EMPTY);
      return r;
    },
    [snap],
  );

  const clear = useCallback(() => setSnap(EMPTY), []);

  return {
    mode: snap.mode,
    values: snap.values,
    sources: snap.sources,
    copy,
    cut,
    paste,
    clear,
  };
}
