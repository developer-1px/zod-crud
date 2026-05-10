// SPEC §5.10 — useJsonDocument facade.
// 정체성 표면. useJson(Axis 1) + useSelection·useFocus(Axis 2) + history facade 를 한 객체로 묶는다.
// 사용자가 처음 만나는 표면. 낮은 레벨이 필요하면 useJson/useSelection/useFocus 로 분리 사용.

import { useMemo } from "react";
import type * as z from "zod";

import { useJson, type JsonOps, type UseJsonOptions, type JsonCrudError } from "./useJson.js";
import { useFocus, type FocusState, type UseFocusOptions } from "./useFocus.js";
import { useSelection, type SelectionState, type UseSelectionOptions } from "./useSelection.js";

export interface UseJsonDocumentOptions<T> {
  history?: number;
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
  selection?: boolean | UseSelectionOptions;
  focus?: boolean | UseFocusOptions<T>;
}

export interface JsonDocumentHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
}

export interface JsonDocument<T> {
  /** 현재 schema-valid JSON state (G3). */
  value: T;
  /** RFC 6902 6 op + patch + load/reset. */
  ops: JsonOps<T>;
  /** undo/redo facade. opt-in (`history > 0`) 일 때 활성. */
  history: JsonDocumentHistory;
  /** Pointer[] 구조 selection. opt-in (`selection: true|options`). */
  selection: SelectionState<T> | undefined;
  /** 단일 활성 Pointer. opt-in (`focus: true|options`). */
  focus: FocusState<T> | undefined;
}

const DISABLED_SELECTION = undefined;
const DISABLED_FOCUS = undefined;

export function useJsonDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonDocumentOptions<z.output<S>> = {},
): JsonDocument<z.output<S>> {
  const useJsonOpts: UseJsonOptions = {};
  if (options.history !== undefined) useJsonOpts.history = options.history;
  if (options.strict !== undefined) useJsonOpts.strict = options.strict;
  if (options.onError !== undefined) useJsonOpts.onError = options.onError;

  const [value, ops] = useJson(schema, initial, useJsonOpts);

  // Selection — opt-in.
  const selectionEnabled = options.selection !== undefined && options.selection !== false;
  const selectionOptions: UseSelectionOptions =
    typeof options.selection === "object" ? options.selection : {};
  const selectionState = useSelection<z.output<S>>(
    ops,
    selectionEnabled ? selectionOptions : { mode: "single" },
  );

  // Focus — opt-in.
  const focusEnabled = options.focus !== undefined && options.focus !== false;
  const focusOptions: UseFocusOptions<z.output<S>> =
    typeof options.focus === "object" ? options.focus : {};
  const focusState = useFocus<z.output<S>>(ops, focusEnabled ? focusOptions : {});

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
      selection: selectionEnabled ? selectionState : DISABLED_SELECTION,
      focus: focusEnabled ? focusState : DISABLED_FOCUS,
    };
  }, [value, ops, selectionEnabled, selectionState, focusEnabled, focusState]);
}
