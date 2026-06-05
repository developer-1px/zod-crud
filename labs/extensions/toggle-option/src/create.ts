import type { JSONDocument, Pointer } from "zod-crud";
import { plan } from "./plan.js";
import type { Mode, ToggleOption, ToggleOptionOptions, ToggleOptionResult } from "./types.js";

export function createToggleOption<TDocument>(doc: JSONDocument<TDocument>): ToggleOption<TDocument> {
  return {
    canToggle: (path, value, options) => plan(doc, path, value, "toggle", options),
    toggle: (path, value, options) => apply(doc, path, value, "toggle", options),
    add: (path, value, options) => apply(doc, path, value, "add", options),
    remove: (path, value, options) => apply(doc, path, value, "remove", options),
  };
}

function apply<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  value: TValue,
  mode: Mode,
  options?: ToggleOptionOptions<TValue>,
): ToggleOptionResult {
  const change = plan(doc, path, value, mode, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `toggle-option patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}
