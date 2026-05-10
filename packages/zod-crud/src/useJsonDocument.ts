// SPEC §5.10 — useJsonDocument facade.
// 정체성 표면. useJson(Axis 1) + useSelection·useFocus(Axis 2) + history facade 를 한 객체로 묶는다.
// History 는 이 facade 가 소유한다 — Axis 2 state(focus·selection) 도 entry 에 함께 캡처해야
// 사용자 한 동작 = 한 undo 가 데이터+UI 상태 전부를 원복.

import { useCallback, useMemo, useRef } from "react";
import type * as z from "zod";

import { useJson, type JsonOps, type UseJsonOptions, type JsonCrudError } from "./useJson.js";
import { useFocus, type FocusState, type UseFocusOptions } from "./useFocus.js";
import { useSelection, type SelectionState, type UseSelectionOptions } from "./useSelection.js";
import { computeInverses, type JsonPatchOperation } from "./core/patch.js";
import type { Pointer } from "./core/pointer.js";

export interface UseJsonDocumentOptions<T> {
  history?: number;
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
  selection?: boolean | UseSelectionOptions;
  focus?: boolean | UseFocusOptions;
}

export interface JsonDocumentHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
}

export interface JsonDocument<T> {
  value: T;
  ops: JsonOps<T>;
  history: JsonDocumentHistory;
  selection: SelectionState<T> | undefined;
  focus: FocusState<T> | undefined;
}

const COALESCE_MS = 500;

interface SelectionSnap {
  values: ReadonlyArray<Pointer>;
  anchor: Pointer | null;
  focus: Pointer | null;
}

interface HistoryEntry {
  forward: JsonPatchOperation[];
  inverse: JsonPatchOperation[];
  focusBefore: Pointer | null;
  selectionBefore: SelectionSnap;
  focusAfter: Pointer | null;
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

  const focusEnabled = options.focus !== undefined && options.focus !== false;
  const focusOptions: UseFocusOptions =
    typeof options.focus === "object" ? options.focus : {};
  const focusState = useFocus<z.output<S>>(rawOps, focusEnabled ? focusOptions : {});

  const historyLimit = options.history ?? 0;
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const lastDispatchAtRef = useRef(0);
  const isRestoringRef = useRef(false);

  const focusRef = useRef(focusState);
  focusRef.current = focusState;
  const selectionRef = useRef(selectionState);
  selectionRef.current = selectionState;

  const snapSelection = useCallback((): SelectionSnap => ({
    values: [...selectionRef.current.values],
    anchor: selectionRef.current.anchor,
    focus: selectionRef.current.focus,
  }), []);

  const recordHistory = useCallback((before: z.output<S>, ops: ReadonlyArray<JsonPatchOperation>) => {
    if (historyLimit <= 0 || isRestoringRef.current) return;
    const inv = computeInverses(before, ops);
    if (!inv.ok) return;
    const now = Date.now();
    const stack = undoStackRef.current;
    const last = stack[stack.length - 1];
    if (last && now - lastDispatchAtRef.current < COALESCE_MS) {
      last.forward.push(...ops);
      last.inverse.unshift(...inv.inverses);
    } else {
      stack.push({
        forward: [...ops],
        inverse: inv.inverses,
        focusBefore: focusRef.current.value,
        selectionBefore: snapSelection(),
        focusAfter: focusRef.current.value,
        selectionAfter: snapSelection(),
      });
      if (stack.length > historyLimit) stack.shift();
    }
    lastDispatchAtRef.current = now;
    redoStackRef.current = [];
  }, [historyLimit, snapSelection]);

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    return {
      add(path, value) {
        const before = rawOps.state;
        const r = rawOps.add(path, value);
        if (r.ok) recordHistory(before, [{ op: "add", path: path as Pointer, value }]);
        return r;
      },
      remove(path) {
        const before = rawOps.state;
        const r = rawOps.remove(path);
        if (r.ok) recordHistory(before, [{ op: "remove", path: path as Pointer }]);
        return r;
      },
      replace(path, value) {
        const before = rawOps.state;
        const r = rawOps.replace(path, value);
        if (r.ok) recordHistory(before, [{ op: "replace", path: path as Pointer, value }]);
        return r;
      },
      move(from, path) {
        const before = rawOps.state;
        const r = rawOps.move(from, path);
        if (r.ok) recordHistory(before, [{ op: "move", from: from as Pointer, path: path as Pointer }]);
        return r;
      },
      copy(from, path) {
        const before = rawOps.state;
        const r = rawOps.copy(from, path);
        if (r.ok) recordHistory(before, [{ op: "copy", from: from as Pointer, path: path as Pointer }]);
        return r;
      },
      test: rawOps.test,
      patch(operations) {
        const before = rawOps.state;
        const r = rawOps.patch(operations);
        if (r.ok) recordHistory(before, operations);
        return r;
      },

      undo() {
        const e = undoStackRef.current.pop();
        if (!e) return false;
        e.focusAfter = focusRef.current.value;
        e.selectionAfter = snapSelection();
        isRestoringRef.current = true;
        const r = rawOps.patch(e.inverse);
        isRestoringRef.current = false;
        if (!r.ok) {
          undoStackRef.current.push(e);
          return false;
        }
        focusRef.current.set(e.focusBefore);
        selectionRef.current.set(e.selectionBefore.values);
        redoStackRef.current.push(e);
        lastDispatchAtRef.current = 0;
        return true;
      },
      redo() {
        const e = redoStackRef.current.pop();
        if (!e) return false;
        isRestoringRef.current = true;
        const r = rawOps.patch(e.forward);
        isRestoringRef.current = false;
        if (!r.ok) {
          redoStackRef.current.push(e);
          return false;
        }
        focusRef.current.set(e.focusAfter);
        selectionRef.current.set(e.selectionAfter.values);
        undoStackRef.current.push(e);
        lastDispatchAtRef.current = 0;
        return true;
      },
      canUndo() { return undoStackRef.current.length > 0; },
      canRedo() { return redoStackRef.current.length > 0; },

      load(v) { undoStackRef.current = []; redoStackRef.current = []; return rawOps.load(v); },
      reset(v) { undoStackRef.current = []; redoStackRef.current = []; rawOps.reset(v); },
      subscribe: rawOps.subscribe,
      get state() { return rawOps.state; },
    };
  }, [rawOps, recordHistory, snapSelection]);

  return useMemo<JsonDocument<z.output<S>>>(() => {
    const history: JsonDocumentHistory = {
      get canUndo() { return ops.canUndo(); },
      get canRedo() { return ops.canRedo(); },
      undo: () => ops.undo(),
      redo: () => ops.redo(),
    };
    return {
      value,
      ops,
      history,
      selection: selectionEnabled ? selectionState : undefined,
      focus: focusEnabled ? focusState : undefined,
    };
  }, [value, ops, selectionEnabled, selectionState, focusEnabled, focusState]);
}
