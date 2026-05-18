// RFC 6902 op wrappers + undo/redo/restore + load/reset for useJSONDocument.
// Pure builder: returns the ops object given the raw useJSON ops and history refs.

import type { MutableRefObject } from "react";

import type { JSONOps, JSONDocumentOps } from "../jsonOps.js";
import { JSONCrudError } from "../JSONCrudError.js";
import type { SelectionState } from "./useSelection.js";
import type { JSONPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { parsePointer, readAt } from "../core/pointer/index.js";
import {
  back as historyBack,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  emptyHistory,
  forward as historyForward,
  type HistoryStack,
} from "../core/history.js";
import {
  recordHistoryEntry,
  snapSelection,
  type HistoryEntry,
} from "./jsonDocumentHistory.js";

export interface BuildJSONDocumentOpsArgs<T> {
  rawOps: JSONOps<T>;
  stackRef: MutableRefObject<HistoryStack<HistoryEntry>>;
  isRestoringRef: MutableRefObject<boolean>;
  selectionRef: MutableRefObject<SelectionState<T>>;
  historyLimit: number;
}

export function buildJSONDocumentOps<T>(args: BuildJSONDocumentOpsArgs<T>): JSONDocumentOps<T> {
  const { rawOps, stackRef, isRestoringRef, selectionRef, historyLimit } = args;

  const patch: JSONOps<T>["patch"] = (operations) => {
    const before = rawOps.state;
    const r = rawOps.patch(operations);
    if (r.ok && historyLimit > 0 && !isRestoringRef.current) {
      recordHistoryEntry(stackRef, before, operations, selectionRef.current, historyLimit);
    }
    return r;
  };

  const restore = (direction: "undo" | "redo"): boolean => {
    const popped = direction === "undo"
      ? historyBack(stackRef.current)
      : historyForward(stackRef.current);
    if (!popped) return false;
    const e = popped.entry;
    if (direction === "undo") e.selectionAfter = snapSelection(selectionRef.current);
    isRestoringRef.current = true;
    let r: ReturnType<JSONOps<T>["patch"]>;
    try {
      r = rawOps.patch(direction === "undo" ? e.inverse : e.forward);
    } catch {
      return false;
    } finally {
      isRestoringRef.current = false;
    }
    if (!r.ok) return false; // 스택 갱신 안 함 — 원상태 유지
    stackRef.current = popped.next;
    const t = direction === "undo" ? e.selectionBefore : e.selectionAfter;
    if (t.anchor && t.focus) selectionRef.current.setBaseAndExtent(t.anchor, t.focus);
    else selectionRef.current.empty();
    return true;
  };

  return {
    add: (path, value) => patch([{ op: "add", path: path as Pointer, value }]),
    remove: (path) => patch([{ op: "remove", path: path as Pointer }]),
    replace: (path, value) => patch([{ op: "replace", path: path as Pointer, value }]),
    move: (from, path) => patch([{ op: "move", from: from as Pointer, path: path as Pointer }]),
    copy: (from, path) => patch([{ op: "copy", from: from as Pointer, path: path as Pointer }]),
    test: rawOps.test,
    set: (path, value) => {
      // history 가 wrapping 된 patch 를 거치도록 분기 op 를 합성. rawOps.set 직접 호출 시 history 우회.
      const p = path as Pointer;
      const segments = parsePointer(p);
      const cur = readAt(rawOps.state, segments);
      if (value === undefined) {
        if (!cur.ok) return { ok: true };
        return patch([{ op: "remove", path: p }]);
      }
      if (!cur.ok) return patch([{ op: "add", path: p, value }]);
      if (cur.value === value) return { ok: true };
      return patch([{ op: "replace", path: p, value }]);
    },
    patch,
    apply: (operations) => {
      const r = patch(operations);
      if (!r.ok) throw new JSONCrudError("patch", r);
    },
    undo: () => restore("undo"),
    redo: () => restore("redo"),
    canUndo: () => historyCanUndo(stackRef.current),
    canRedo: () => historyCanRedo(stackRef.current),
    load: (v, options) => {
      if (!options?.preserveHistory) stackRef.current = emptyHistory<HistoryEntry>();
      return rawOps.load(v);
    },
    reset: (v) => { stackRef.current = emptyHistory<HistoryEntry>(); rawOps.reset(v); },
    subscribe: rawOps.subscribe,
    get state() { return rawOps.state; },
  };
}
