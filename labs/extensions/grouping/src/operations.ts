import type { JSONDocument, JSONResult, Pointer } from "@interactive-os/json-document";
import { canGroupSelection, canUngroupSelection, groupingError } from "./plan.js";
import type { GroupingAdapter, GroupingApplyResult, GroupingError, GroupingOperation, GroupingSource } from "./types.js";

export function groupSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: GroupingSource,
): GroupingApplyResult {
  const change = canGroupSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("group", change.parent, result);

  return {
    ...change,
    result,
  };
}

export function ungroupSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: Pointer,
): GroupingApplyResult {
  const change = canUngroupSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("ungroup", change.parent, result);

  return {
    ...change,
    result,
  };
}

function patchError(
  operation: GroupingOperation,
  parent: Pointer,
  result: Exclude<JSONResult, { ok: true }>,
): GroupingError {
  const error = groupingError("patch_failed", result.reason ?? "grouping patch failed", result.pointer, {
    operation,
    parent,
  });
  error.result = result;
  return error;
}
