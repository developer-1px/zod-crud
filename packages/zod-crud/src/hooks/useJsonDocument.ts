// SPEC §5.10 — useJsonDocument facade.
// 정체성 표면. 단일 진입점. data + selection + history 를 한 객체로 묶는다.
// History 는 core/history (pure reducer) 에 위임한다 (P2).
// DOM Selection 모델 — 별도 focus 축은 없다. 캐럿 = collapsed selection.

import { useCallback, useMemo, useRef } from "react";
import type * as z from "zod";

import { useJson, type JsonOps, type UseJsonOptions, type JsonCrudError } from "./useJson.js";
import { useSelection, type SelectionState, type UseSelectionOptions } from "./useSelection.js";
import { buildJsonDocumentOps } from "./buildJsonDocumentOps.js";
import { buildCommands, type Commands } from "./buildCommands.js";
import { buildCan, type Can } from "./buildCan.js";
import { type HistoryEntry } from "./jsonDocumentHistory.js";
import {
  emptyHistory,
  mergeLast as historyMergeLast,
  type HistoryStack,
} from "../core/history.js";

export interface UseJsonDocumentOptions<T> {
  history?: number;
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
  selection?: boolean | UseSelectionOptions;
}

/** History state surface — undo/redo 는 commands.undo/redo 또는 직접 method 로. */
export interface JsonDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  mergeLast(): boolean;
}

/**
 * JsonDocument — 단일 facade. 4대 기둥 ↔ 10 verbs (ADR-0002).
 *
 * State surface (read-only data):
 * - value: T — current state
 * - selection: SelectionState — read-only 좌표 state
 * - history: { canUndo, canRedo, mergeLast } — read-only flags
 * - ops: RFC 6902 raw escape hatch (low-level)
 *
 * Editor command surface (TipTap 식 디팩토 — `commands` + `can` group):
 * - commands: 10 verb methods (select/find/move/duplicate/replace/cut/copy/paste/undo/redo)
 * - can: mutation guard predicates + stack flags
 */
export interface JsonDocument<T> {
  value: T;
  selection: SelectionState<T> | undefined;
  history: JsonDocumentHistory;
  ops: JsonOps<T>;
  commands: Commands<T>;
  can: Can<T>;
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

  const commands = useMemo(
    () => buildCommands({ schema, ops, selectionRef }),
    [schema, ops],
  );
  const can = useMemo(() => buildCan({ schema, ops }), [schema, ops]);

  return useMemo<JsonDocument<z.output<S>>>(() => {
    const history: JsonDocumentHistory = {
      get canUndo() { return ops.canUndo(); },
      get canRedo() { return ops.canRedo(); },
      mergeLast,
    };
    return {
      value,
      selection: selectionEnabled ? selectionState : undefined,
      history,
      ops,
      commands,
      can,
    };
  }, [value, ops, selectionEnabled, selectionState, mergeLast, commands, can]);
}
