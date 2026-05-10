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
  /**
   * 최상단 두 entry 를 하나로 합친다 — 직전 dispatch 가 같은 사용자 동작의 일부였다고
   * 판단했을 때 editor 가 호출. 정책 (시간·op 종류 등) 은 editor 책임.
   * 합칠 entry 가 부족하거나 isRestoring 중이면 false 반환.
   */
  mergeLast: () => boolean;
}

export interface JsonDocument<T> {
  value: T;
  ops: JsonOps<T>;
  history: JsonDocumentHistory;
  selection: SelectionState<T> | undefined;
  focus: FocusState<T> | undefined;
}

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

  // 매 dispatch = 1 entry. 시간·정책은 editor 책임 — `mergeLast()` 로 합치도록 노출.
  const recordHistory = useCallback((before: z.output<S>, ops: ReadonlyArray<JsonPatchOperation>) => {
    if (historyLimit <= 0 || isRestoringRef.current) return;
    const inv = computeInverses(before, ops);
    if (!inv.ok) return;
    const stack = undoStackRef.current;
    stack.push({
      forward: [...ops],
      inverse: inv.inverses,
      focusBefore: focusRef.current.value,
      selectionBefore: snapSelection(),
      focusAfter: focusRef.current.value,
      selectionAfter: snapSelection(),
    });
    if (stack.length > historyLimit) stack.shift();
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

  const mergeLast = useCallback((): boolean => {
    if (isRestoringRef.current) return false;
    const stack = undoStackRef.current;
    if (stack.length < 2) return false;
    const top = stack.pop()!;
    const prev = stack[stack.length - 1]!;
    // forward 는 시간 순서대로 이어붙임. inverse 는 역순으로 prepend.
    prev.forward.push(...top.forward);
    prev.inverse = [...top.inverse, ...prev.inverse];
    // axis 2 snapshot 은 prev 의 before 가 사용자 동작 시작점이므로 그대로 두고
    // after 는 top 의 after 로 갱신.
    prev.focusAfter = top.focusAfter;
    prev.selectionAfter = top.selectionAfter;
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
      focus: focusEnabled ? focusState : undefined,
    };
  }, [value, ops, selectionEnabled, selectionState, focusEnabled, focusState, mergeLast]);
}
