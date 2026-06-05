import type { CapabilityResult } from "../can/result.js";
import type { Pointer } from "../../../foundation/pointer/index.js";

export type SchemaPathMode = "value" | "insert";

export type SchemaKind =
  | "unknown"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "literal"
  | "enum"
  | "object"
  | "array"
  | "record"
  | "union"
  | "discriminatedUnion"
  | "optional"
  | "nullable"
  | "any";

export interface SchemaDescription {
  kind: SchemaKind;
  jsonSchema: unknown;
  keys?: string[];
  elementKind?: SchemaKind;
  valueKind?: SchemaKind;
  discriminator?: string;
  allowed?: unknown[];
}

export type SchemaErrorCode = "invalid_pointer" | "path_not_found";

export interface SchemaErrorResult {
  ok: false;
  code: SchemaErrorCode;
  reason?: string;
  pointer: Pointer;
}

export type SchemaQueryResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      kind: SchemaKind;
      description: SchemaDescription;
    }
  | SchemaErrorResult;

export type SchemaKindResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      kind: SchemaKind;
    }
  | SchemaErrorResult;

export type SchemaDescriptionResult =
  | {
      ok: true;
      path: Pointer;
      mode: SchemaPathMode;
      description: SchemaDescription;
    }
  | SchemaErrorResult;

export interface SchemaState {
  at(path: Pointer, mode?: SchemaPathMode): SchemaQueryResult;
  kind(path: Pointer, mode?: SchemaPathMode): SchemaKindResult;
  accepts(path: Pointer, value: unknown, mode?: SchemaPathMode): CapabilityResult;
  describe(path: Pointer, mode?: SchemaPathMode): SchemaDescriptionResult;
}
