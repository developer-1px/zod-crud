import {
  EMPTY_SELECTION,
  type SelectionSnap,
} from "../../../domain/selection/types.js";
import type { JSONStateOps } from "../state/types.js";
import { createSelection, type SelectionState } from "./create.js";
import type {
  SelectionOptions,
  SelectionRuntimeAccess,
} from "./types.js";

export interface DocumentSelectionRuntime {
  enabled: boolean;
  state: SelectionState | undefined;
  access: SelectionRuntimeAccess;
  ref: { readonly current: SelectionSnap } | undefined;
}

interface CreateDocumentSelectionRuntimeInput<T> {
  ops: JSONStateOps<T>;
  selection?: boolean | SelectionOptions | undefined;
  onChange?: (() => void) | undefined;
}

export function createDocumentSelectionRuntime<T>(
  input: CreateDocumentSelectionRuntimeInput<T>,
): DocumentSelectionRuntime {
  const selectionEnabled = input.selection !== undefined && input.selection !== false;
  const selectionOptions: SelectionOptions = typeof input.selection === "object" ? input.selection : {};
  const createSelectionOptions: SelectionOptions & { onChange?: () => void; applyMetadataSelectionAfter: true } = {
    ...selectionOptions,
    applyMetadataSelectionAfter: true,
  };
  if (input.onChange !== undefined) createSelectionOptions.onChange = input.onChange;

  const selectionState = selectionEnabled ? createSelection<T>(input.ops, createSelectionOptions) : undefined;
  const snapSelection = () => selectionState?.snapshot() ?? EMPTY_SELECTION;

  return {
    enabled: selectionEnabled,
    state: selectionState,
    access: {
      selectionEnabled,
      selectionMode: selectionOptions.mode ?? "single",
      snapSelection,
      restoreSelection: (selection) => { selectionState?.restore(selection); },
    },
    ref: selectionState ? { get current() { return selectionState; } } : undefined,
  };
}
