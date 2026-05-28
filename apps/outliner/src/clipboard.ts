// Outliner adapter clipboard buffer for product-specific sibling/child paste policy.
// zod-crud owns the headless JSON clipboard API; this demo maps UI clipboard
// semantics to JSON Patch locally.

import { useCallback, useState } from "react";
import type { ClipboardPasteResult, JSONDocument, Pointer, JSONResult } from "zod-crud";
import type { OutlineNode } from "./schema.js";
import { readNode } from "./pointer-utils.js";

export type ClipboardMode = "empty" | "copy" | "cut";

export interface ClipboardSnapshot {
  mode: ClipboardMode;
  values: ReadonlyArray<OutlineNode>;
  sources: ReadonlyArray<Pointer>;
}

export type PasteMode = "sibling" | "child";
export type ClipboardPasteCommandResult = JSONResult | ClipboardPasteResult<OutlineNode>;

export interface ClipboardApi {
  mode: ClipboardMode;
  values: ReadonlyArray<OutlineNode>;
  sources: ReadonlyArray<Pointer>;
  copy(state: OutlineNode, sources: ReadonlyArray<Pointer>): void;
  cut(state: OutlineNode, sources: ReadonlyArray<Pointer>): void;
  paste(target: Pointer, mode: PasteMode, document: Pick<JSONDocument<OutlineNode>, "paste">): ClipboardPasteCommandResult;
  clear(): void;
}

const EMPTY: ClipboardSnapshot = { mode: "empty", values: [], sources: [] };

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function pasteTarget(target: Pointer, mode: PasteMode): Pointer | { after: Pointer } {
  if (mode === "child" || target === "") return `${target}/children/-`;
  return { after: target };
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
    (target: Pointer, mode: PasteMode, document: Pick<JSONDocument<OutlineNode>, "paste">): ClipboardPasteCommandResult => {
      // closure 로 잡힌 snap 이 아니라 현재 state 를 읽어야 하지만,
      // setSnap 콜백 안에서 처리하기 위해 일단 snap 로 처리 후 cut 모드면 비움.
      const cur = snap;
      if (cur.mode === "empty" || cur.values.length === 0) {
        return { ok: false, code: "path_not_found", reason: "clipboard is empty" };
      }
      // cmd.cut 이 원본을 이미 제거했으므로 paste 는 mode 무관 add 만.
      // mode = cut 일 때만 paste 후 클립보드 비움 (1회용 — Workflowy / Notion 표준).
      const r = document.paste(pasteTarget(target, mode), {
        payload: cur.values.map((value) => deepClone(value)),
        spread: true,
      });
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
