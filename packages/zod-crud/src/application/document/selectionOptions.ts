import type {
  SelectionContext,
  SelectionMode,
  SelectionRangeInput,
} from "../../domain/selection/selectionTypes.js";

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
  context?: SelectionContext;
}
