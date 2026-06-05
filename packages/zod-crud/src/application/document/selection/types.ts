import type {
  SelectionContext,
  SelectionMode,
  SelectionRangeInput,
  SelectionSnap,
} from "../../../domain/selection/types.js";

export interface SelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
  context?: SelectionContext;
}

export interface SelectionRuntimeAccess {
  selectionEnabled: boolean;
  selectionMode: SelectionMode;
  snapSelection: () => SelectionSnap;
  restoreSelection: (selection: SelectionSnap) => void;
}
