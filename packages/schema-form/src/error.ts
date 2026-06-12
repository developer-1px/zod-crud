import type {
  EntryKind,
  Pointer,
  SchemaKind,
} from "@interactive-os/json-document";

import type {
  SchemaFormError,
  SchemaFormErrorCode,
} from "./types.js";

export function schemaFormError(
  code: SchemaFormErrorCode,
  reason: string,
  pointer: Pointer,
  kind?: EntryKind | SchemaKind,
): SchemaFormError {
  return { ok: false, code, reason, pointer, ...(kind === undefined ? {} : { kind }) };
}
