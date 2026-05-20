// SPEC §5.10 — useJSONDocument facade.
// 정체성 표면. 단일 진입점. data + selection + history 를 한 객체로 묶는다.
// History 는 core/history (pure reducer) 에 위임한다 (P2).
// DOM Selection 모델 — 별도 focus 축은 없다. 캐럿 = collapsed selection.

import { useCallback, useMemo, useReducer, useRef } from "react";
import type * as z from "zod";

import { useJSON, type UseJSONOptions, type JSONCrudError } from "./useJSON.js";
import type { JSONOps, JSONDocumentOps } from "../jsonOps.js";
import { useSelection, type SelectionState, type UseSelectionOptions } from "./useSelection.js";
import { buildJSONDocumentOps } from "./buildJSONDocumentOps.js";
import { buildCommands, type Commands } from "../commands/buildCommands.js";
import { buildCan, type Can } from "../commands/buildCan.js";
import { buildCheck, type Check } from "../check.js";
import { createClipboardState, type ClipboardState } from "../clipboard.js";
import { type HistoryEntry } from "./jsonDocumentHistory.js";
import {
  emptyHistory,
  mergeLast as historyMergeLast,
  type HistoryStack,
} from "../core/history.js";

export interface UseJSONDocumentOptions<T> {
  history?: number;
  strict?: boolean;
  onError?: (error: JSONCrudError) => void;
  selection?: boolean | UseSelectionOptions;
}

/** History state surface — undo/redo 는 commands.undo/redo 또는 직접 method 로. */
export interface JSONDocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  mergeLast(): boolean;
  /**
   * #56 — fn 내부의 모든 ops 를 한 history step 으로 collapse.
   * 각 op 은 동기적으로 state 를 갱신하여 display sync 는 깨지지 않는다.
   * fn 종료 후 mergeLast 를 반복 호출하여 단일 entry 로 압축.
   */
  transaction(fn: () => void): void;
}

/**
 * JSONDocument — 단일 facade. 4대 기둥 ↔ 10 verbs (ADR-0002).
 *
 * State surface (read-only data):
 * - value: T — current state
 * - selection: SelectionState — read-only 좌표 state
 * - history: canUndo/canRedo/depth flags + mergeLast/transaction
 * - ops: RFC 6902 raw escape hatch (low-level)
 *
 * Command surface (TipTap 식 디팩토 — `commands` + `can` group):
 * - commands: 10 verb methods (select/find/move/duplicate/replace/cut/copy/paste/undo/redo)
 * - can: mutation guard predicates + stack flags
 * - check: explainable dry-run guard results
 */
export interface JSONDocument<T> {
  value: T;
  selection: SelectionState<T> | undefined;
  history: JSONDocumentHistory;
  ops: JSONDocumentOps<T>;
  commands: Commands<T>;
  can: Can<T>;
  check: Check<T>;
  clipboard: ClipboardState<T>;
}

export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJSONDocumentOptions<z.output<S>> = {},
): JSONDocument<z.output<S>> {
  const useJsonOpts: UseJSONOptions = {};
  if (options.strict !== undefined) useJsonOpts.strict = options.strict;
  if (options.onError !== undefined) useJsonOpts.onError = options.onError;

  const [value, rawOps] = useJSON(schema, initial, useJsonOpts);

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

  const ops = useMemo<JSONDocumentOps<z.output<S>>>(
    () => buildJSONDocumentOps({ rawOps, stackRef, isRestoringRef, selectionRef, historyLimit }),
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

  const transaction = useCallback((fn: () => void): void => {
    const depthBefore = stackRef.current.undo.length;
    fn();
    while (stackRef.current.undo.length > depthBefore + 1) {
      if (!mergeLast()) break;
    }
  }, [mergeLast]);

  const commands = useMemo(
    () => buildCommands({ schema, ops, selectionRef }),
    [schema, ops],
  );
  const check = useMemo(() => buildCheck({ schema, ops }), [schema, ops]);
  const can = useMemo(() => buildCan({ schema, ops, check }), [schema, ops, check]);
  const [, bumpClipboardVersion] = useReducer((version: number) => version + 1, 0);
  const clipboard = useMemo(
    () => createClipboardState({ schema, getState: () => ops.state, ops, onChange: bumpClipboardVersion }),
    [schema, ops],
  );

  return useMemo<JSONDocument<z.output<S>>>(() => {
    const history: JSONDocumentHistory = {
      get canUndo() { return ops.canUndo(); },
      get canRedo() { return ops.canRedo(); },
      get undoDepth() { return stackRef.current.undo.length; },
      get redoDepth() { return stackRef.current.redo.length; },
      mergeLast,
      transaction,
    };
    return {
      value,
      selection: selectionEnabled ? selectionState : undefined,
      history,
      ops,
      commands,
      can,
      check,
      clipboard,
    };
  }, [value, ops, selectionEnabled, selectionState, mergeLast, transaction, commands, can, check, clipboard]);
}
