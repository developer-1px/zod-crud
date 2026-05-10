// SPEC §5.10 — useJsonDocument facade.
// 정체성 표면. 단일 진입점. data + selection + history 를 한 객체로 묶는다.
// History 는 core/history/stack (pure reducer) 에 위임한다 (P2).
// DOM Selection 모델 — 별도 focus 축은 없다. 캐럿 = collapsed selection.

import { useCallback, useMemo, useRef } from "react";
import type * as z from "zod";

import { useJson, type JsonOps, type UseJsonOptions, type JsonCrudError } from "./useJson.js";
import { useSelection, type SelectionState, type UseSelectionOptions } from "./useSelection.js";
import { computeInverses, type JsonPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import {
  back as historyBack,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  clear as historyClear,
  commit as historyCommit,
  emptyHistory,
  forward as historyForward,
  mergeLast as historyMergeLast,
  type HistoryStack,
} from "../core/history/stack.js";

export interface UseJsonDocumentOptions<T> {
  history?: number;
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
  selection?: boolean | UseSelectionOptions;
}

export interface JsonDocumentHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  mergeLast: () => boolean;
}

export interface JsonDocument<T> {
  value: T;
  ops: JsonOps<T>;
  history: JsonDocumentHistory;
  selection: SelectionState<T> | undefined;
}

interface SelectionSnap {
  ranges: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

interface HistoryEntry {
  forward: JsonPatchOperation[];
  inverse: JsonPatchOperation[];
  selectionBefore: SelectionSnap;
  selectionAfter: SelectionSnap;
}

export function useJsonDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonDocumentOptions<z.output<S>> = {},
): JsonDocument<z.output<S>> {
  const useJsonOpts: UseJsonOptions = { history: 0 };
  if (options.strict !== undefined) useJsonOpts.strict = options.strict;
  if (options.onError !== undefined) useJsonOpts.onError = options.onError;

  const [value, rawOps] = useJson(schema, initial, useJsonOpts);

  const selectionEnabled = options.selection !== undefined && options.selection !== false;
  const selectionOptions: UseSelectionOptions =
    typeof options.selection === "object" ? options.selection : {};
  const selectionState = useSelection<z.output<S>>(
    rawOps,
    selectionEnabled ? selectionOptions : { mode: "single" },
  );

  const historyLimit = options.history ?? 0;
  const stackRef = useRef<HistoryStack<HistoryEntry>>(emptyHistory<HistoryEntry>());
  const isRestoringRef = useRef(false);

  const selectionRef = useRef(selectionState);
  selectionRef.current = selectionState;

  const snapSelection = useCallback((): SelectionSnap => ({
    ranges: [...selectionRef.current.ranges],
    anchor: selectionRef.current.anchor,
    focus: selectionRef.current.focus,
  }), []);

  const recordHistory = useCallback((before: z.output<S>, ops: ReadonlyArray<JsonPatchOperation>) => {
    if (historyLimit <= 0 || isRestoringRef.current) return;
    const inv = computeInverses(before, ops);
    if (!inv.ok) return;
    const snap = snapSelection();
    const entry: HistoryEntry = {
      forward: [...ops],
      inverse: inv.inverses,
      selectionBefore: snap,
      selectionAfter: snap,
    };
    stackRef.current = historyCommit(stackRef.current, entry, historyLimit);
  }, [historyLimit, snapSelection]);

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    const patch: JsonOps<z.output<S>>["patch"] = (operations) => {
      const before = rawOps.state;
      const r = rawOps.patch(operations);
      if (r.ok) recordHistory(before, operations);
      return r;
    };
    const restore = (direction: "undo" | "redo"): boolean => {
      const popped = direction === "undo" ? historyBack(stackRef.current) : historyForward(stackRef.current);
      if (!popped) return false;
      const e = popped.entry;
      if (direction === "undo") e.selectionAfter = snapSelection();
      isRestoringRef.current = true;
      const r = rawOps.patch(direction === "undo" ? e.inverse : e.forward);
      isRestoringRef.current = false;
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
      patch,
      undo: () => restore("undo"),
      redo: () => restore("redo"),
      canUndo: () => historyCanUndo(stackRef.current),
      canRedo: () => historyCanRedo(stackRef.current),
      load: (v) => { stackRef.current = historyClear<HistoryEntry>(); return rawOps.load(v); },
      reset: (v) => { stackRef.current = historyClear<HistoryEntry>(); rawOps.reset(v); },
      subscribe: rawOps.subscribe,
      get state() { return rawOps.state; },
    };
  }, [rawOps, recordHistory, snapSelection]);

  const mergeLast = useCallback((): boolean => {
    if (isRestoringRef.current) return false;
    const next = historyMergeLast(stackRef.current, (prev, top) => ({
      forward: [...prev.forward, ...top.forward],
      inverse: [...top.inverse, ...prev.inverse],
      selectionBefore: prev.selectionBefore,
      selectionAfter: top.selectionAfter,
    }));
    if (!next) return false;
    stackRef.current = next;
    return true;
  }, []);

  return useMemo<JsonDocument<z.output<S>>>(() => {
    const history: JsonDocumentHistory = {
      get canUndo() { return ops.canUndo(); },
      get canRedo() { return ops.canRedo(); },
      undo: () => ops.undo(),
      redo: () => ops.redo(),
      mergeLast,
    };
    return {
      value,
      ops,
      history,
      selection: selectionEnabled ? selectionState : undefined,
    };
  }, [value, ops, selectionEnabled, selectionState, mergeLast]);
}
