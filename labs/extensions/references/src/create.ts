import type { JSONDocument, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";
import { indexReferences, resolveReference } from "./operations.js";
import { canSetReference, cloneJson, copyLink, referenceError } from "./plan.js";
import type { ReferenceError, References, ReferencesDescriptor, ReferenceSetInput } from "./types.js";

export function createReferences<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: ReferencesDescriptor,
): References<TDocument> {
  return {
    current: () => indexReferences(doc, descriptor),
    targets(target) {
      const targets = indexReferences(doc, descriptor).targets;
      return target === undefined
        ? targets
        : targets.filter((entry) => entry.target === target);
    },
    outgoing(source) {
      const links = indexReferences(doc, descriptor).links;
      return source === undefined
        ? links
        : links.filter((link) => containsPointer(source, link.source));
    },
    backlinks(target, id) {
      const resolved = resolveReference(doc, descriptor, target, id);
      if (!resolved.ok && resolved.code === "target_not_found") return resolved;

      return {
        ok: true,
        links: indexReferences(doc, descriptor).links
          .filter((link) => link.target === target && link.id === id)
          .map(copyLink),
      };
    },
    resolve: (target, id) => resolveReference(doc, descriptor, target, id),
    canSet: (input) => canSetReference(doc, descriptor, input),
    set(input, metadata) {
      const plan = canSetReference(doc, descriptor, input);
      if (!plan.ok) return plan;

      const result = doc.patch(plan.operation, metadata);
      if (!result.ok) return patchError(input, result);
      return { ok: true, operation: cloneJson(plan.operation) as JSONPatchOperation, result };
    },
  };
}

function containsPointer(base: Pointer, path: Pointer): boolean {
  if (base === "") return true;
  return path === base || path.startsWith(`${base}/`);
}

function patchError(
  input: ReferenceSetInput,
  result: Exclude<JSONResult, { ok: true }>,
): ReferenceError {
  return referenceError("patch_failed", result.reason ?? "reference patch failed", {
    field: input.field,
    pointer: result.pointer ?? input.source,
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}
