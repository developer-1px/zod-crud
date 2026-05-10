// SPEC §5.10 — useJsonDocument facade.
// 정체성 표면. 단일 진입점. data + selection + history 를 한 객체로 묶는다.
// History 는 core/history/stack (pure reducer) 에 위임한다 (P2).
// DOM Selection 모델 — 별도 focus 축은 없다. 캐럿 = collapsed selection.

import { useCallback, useMemo, useRef } from "react";
import type * as z from "zod";

import { useJson, type JsonOps, type UseJsonOptions, type JsonCrudError } from "./useJson.js";
import { useSelection, type SelectionState, type UseSelectionOptions } from "./useSelection.js";
import { buildJsonDocumentOps } from "./json-document-ops.js";
import { type HistoryEntry } from "./json-document-history.js";
import {
  emptyHistory,
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

  const ops = useMemo<JsonOps<z.output<S>>>(
    () => buildJsonDocumentOps({ rawOps, stackRef, isRestoringRef, selectionRef, historyLimit }),
    [rawOps, historyLimit],
  );

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
