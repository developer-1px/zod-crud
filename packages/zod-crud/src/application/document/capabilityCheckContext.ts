import type * as z from "zod";

import {
  EMPTY_SELECTION,
  type SelectionSnap,
} from "../../domain/selection/index.js";
import type { DocumentCapabilityContext } from "./capabilityTypes.js";

export function documentSelectionState<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
): SelectionSnap {
  return context.selection ?? EMPTY_SELECTION;
}

export function documentTrustedState<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
): boolean {
  return context.stateJsonTrusted === true;
}
