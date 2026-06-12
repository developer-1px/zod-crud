import type { JSONDocument } from "@interactive-os/json-document";
import { planCalculatedFields } from "./plan.js";
import type { CalculatedFieldDefinition, CalculatedFieldError, CalculatedFieldsSyncResult } from "./types.js";

export function syncCalculatedFields<TDocument>(
  doc: JSONDocument<TDocument>,
  fields: ReadonlyArray<CalculatedFieldDefinition<TDocument>>,
): CalculatedFieldsSyncResult {
  const plan = planCalculatedFields(doc, fields);
  if (!plan.ok) return plan;
  if (plan.operations.length === 0) return plan;

  const patched = doc.patch(plan.operations);
  if (!patched.ok) {
    const error: CalculatedFieldError = {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? "calculated field patch failed",
      result: patched,
    };
    if (patched.pointer !== undefined) error.pointer = patched.pointer;
    return error;
  }
  return plan;
}
