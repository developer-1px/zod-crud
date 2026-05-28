import type {
  EntryKind,
  JSONCapabilityResult,
  JSONDocument,
  JSONResult,
  Pointer,
  SchemaKind,
} from "zod-crud";

export type SchemaFormContainerKind = "object" | "array" | "record";

export type SchemaFormErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_container";

export interface SchemaFormError {
  ok: false;
  code: SchemaFormErrorCode;
  reason: string;
  pointer: Pointer;
  kind?: EntryKind | SchemaKind;
}

export interface SchemaFormField {
  key: string;
  path: Pointer;
  value: unknown;
  kind: SchemaKind;
  canReplace: JSONCapabilityResult;
  canSet(value: unknown): JSONCapabilityResult;
  set(value: unknown): JSONResult | Exclude<JSONCapabilityResult, { ok: true }>;
}

export type SchemaFormResult =
  | {
      ok: true;
      path: Pointer;
      kind: SchemaFormContainerKind;
      fields: ReadonlyArray<SchemaFormField>;
    }
  | SchemaFormError;

export function createSchemaForm<T>(
  doc: JSONDocument<T>,
  rootPointer: Pointer = "",
): SchemaFormResult {
  const entries = doc.entries(rootPointer);
  if (!entries.ok) {
    return schemaFormError(
      entries.code,
      entries.reason ?? `form root not found: ${rootPointer}`,
      entries.pointer,
    );
  }

  const rootKind = doc.schema.kind(rootPointer);
  if (!rootKind.ok) {
    return schemaFormError(
      rootKind.code,
      rootKind.reason ?? `schema path not found: ${rootPointer}`,
      rootKind.pointer,
    );
  }

  const kind = containerKind(entries.kind, rootKind.kind);
  if (kind === null) {
    return schemaFormError(
      "not_container",
      `schema form root must be an object, record, or array: ${rootPointer}`,
      rootPointer,
      rootKind.kind,
    );
  }

  return {
    ok: true,
    path: rootPointer,
    kind,
    fields: entries.entries.map((entry): SchemaFormField => {
      const fieldKind = doc.schema.kind(entry.path);
      const kind = fieldKind.ok ? fieldKind.kind : "unknown";

      return {
        key: entry.key,
        path: entry.path,
        value: entry.value,
        kind,
        canReplace: doc.canReplace(entry.path, entry.value),
        canSet(value) {
          const accepted = doc.schema.accepts(entry.path, value);
          if (!accepted.ok) return accepted;
          return doc.canReplace(entry.path, value);
        },
        set(value) {
          return doc.replace(entry.path, value);
        },
      };
    }),
  };
}

function containerKind(
  entriesKind: EntryKind,
  schemaKind: SchemaKind,
): SchemaFormContainerKind | null {
  if (entriesKind === "object" || entriesKind === "array" || entriesKind === "record") {
    return entriesKind;
  }

  if (schemaKind === "object" || schemaKind === "array" || schemaKind === "record") {
    return schemaKind;
  }

  return null;
}

function schemaFormError(
  code: SchemaFormErrorCode,
  reason: string,
  pointer: Pointer,
  kind?: EntryKind | SchemaKind,
): SchemaFormError {
  const error: SchemaFormError = { ok: false, code, reason, pointer };
  if (kind !== undefined) error.kind = kind;
  return error;
}
