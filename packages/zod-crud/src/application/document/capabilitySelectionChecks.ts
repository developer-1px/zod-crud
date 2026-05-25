import type * as z from "zod";

import {
  resolveSelectionCursor,
  resolveSelectionScope,
  type SelectionCursorDirection,
  type SelectionCursorOptions,
  type SelectionScopeOptions,
} from "../../domain/selection/index.js";
import {
  type CapabilityResult,
  type DocumentCapabilityContext,
} from "./capabilityTypes.js";
import { documentSelectionState } from "./capabilityCheckContext.js";
import { planDocumentCapabilityResult } from "./capabilityPlan.js";

export function canDocumentSelectScope<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  options?: SelectionScopeOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionScope(context.state, options));
}

export function canDocumentMoveCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(documentSelectionState(context), direction, context.state, options));
}

export function canDocumentExtendCursor<S extends z.ZodType>(
  context: DocumentCapabilityContext<S>,
  direction: SelectionCursorDirection,
  options?: SelectionCursorOptions,
): CapabilityResult {
  return planDocumentCapabilityResult(resolveSelectionCursor(documentSelectionState(context), direction, context.state, options));
}
