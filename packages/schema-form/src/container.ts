import type {
  EntryKind,
  JSONDocument,
  Pointer,
  SchemaKind,
} from "@interactive-os/json-document";

import {
  schemaFormError,
} from "./error.js";
import type {
  SchemaFormContainerKind,
  SchemaFormEntry,
  SchemaFormError,
} from "./types.js";

export type SchemaFormRootResult<T> =
  | {
    ok: true;
    path: Pointer;
    kind: SchemaFormContainerKind;
    entries: ReadonlyArray<SchemaFormEntry>;
  }
  | SchemaFormError;

export function readSchemaFormRoot<T>(
  doc: JSONDocument<T>,
  rootPointer: Pointer,
): SchemaFormRootResult<T> {
  const entries = doc.entries(rootPointer);
  if (!entries.ok) {
    return schemaFormError(
      entries.code,
      entries.reason ?? `form root not found: ${rootPointer}`,
      entries.pointer,
    );
  }

  const rootKind = doc.schema.kind(rootPointer);
  const kind = containerKind(entries.kind, rootKind.ok ? rootKind.kind : "unknown");
  if (kind === null) {
    const rootRead = doc.at(rootPointer);
    return schemaFormError(
      "not_container",
      `schema form root must be an object, record, or array: ${rootPointer}`,
      rootPointer,
      rootKind.ok ? rootKind.kind : valueKind(rootRead.ok ? rootRead.value : undefined),
    );
  }

  return {
    ok: true,
    path: rootPointer,
    kind,
    entries: entries.entries,
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

export function valueKind(value: unknown): SchemaKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}
