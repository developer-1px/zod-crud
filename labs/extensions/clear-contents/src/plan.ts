import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { ClearContentsError, ClearContentsErrorCode, ClearContentsOptions, ClearContentsResult, EmptyFor, SchemaDescription } from "./types.js";

export function canClearContents<TDocument>(
  doc: JSONDocument<TDocument>,
  targets: ReadonlyArray<Pointer>,
  options?: ClearContentsOptions,
): ClearContentsResult {
  if (targets.length === 0) {
    return error("empty_target", "clear-contents target must contain at least one pointer.");
  }

  const operations: JSONPatchOperation[] = [];
  for (const pointer of targets) {
    const described = doc.schema.describe(pointer);
    if (!described.ok) {
      return error("schema_unavailable", described.reason ?? `no schema at ${pointer}`, pointer);
    }
    const description = described.description as SchemaDescription;

    const empty = deriveEmpty(description, pointer, options?.emptyFor);
    if (!empty.ok) {
      return error(
        "cannot_derive_empty",
        `cannot derive an empty value for kind '${description.kind}' at ${pointer}; pass options.emptyFor.`,
        pointer,
      );
    }

    const current = doc.at(pointer);
    if (!current.ok || JSON.stringify(current.value) !== JSON.stringify(empty.value)) {
      operations.push({ op: "replace", path: pointer, value: cloneJson(empty.value) });
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? "clear-contents patch rejected",
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    count: targets.length,
    changed: operations.length > 0,
    pointers: [...targets],
    operations,
    selectionAfter: [...targets],
  };
}

function deriveEmpty(
  description: SchemaDescription,
  pointer: Pointer,
  emptyFor: EmptyFor | undefined,
): { ok: true; value: unknown } | { ok: false } {
  if (emptyFor) {
    return { ok: true, value: emptyFor(description, pointer) };
  }

  const jsonSchema = description.jsonSchema as { default?: unknown } | null;
  if (jsonSchema && typeof jsonSchema === "object" && "default" in jsonSchema) {
    return { ok: true, value: jsonSchema.default };
  }

  switch (description.kind) {
    case "string":
      return { ok: true, value: "" };
    case "number":
      return { ok: true, value: 0 };
    case "boolean":
      return { ok: true, value: false };
    case "null":
    case "nullable":
      return { ok: true, value: null };
    case "array":
      return { ok: true, value: [] };
    case "record":
      return { ok: true, value: {} };
    default:
      // object (required keys), enum/literal (which option?), union, optional,
      // unknown, any — empty is host policy, not derivable from `describe`.
      return { ok: false };
  }
}

function error(code: ClearContentsErrorCode, reason: string, pointer?: Pointer): ClearContentsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as TValue);
}
