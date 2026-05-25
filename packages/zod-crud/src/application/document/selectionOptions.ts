import type {
  SelectionContext,
  SelectionMode,
  SelectionRangeInput,
} from "../../domain/selection/index.js";

export interface UseSelectionOptions {
  mode?: SelectionMode;
  initial?: ReadonlyArray<SelectionRangeInput>;
  context?: SelectionContext;
}
