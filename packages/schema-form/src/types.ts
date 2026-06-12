import type {
  EntryKind,
  JSONCapabilityResult,
  JSONResult,
  Pointer,
  SchemaDescription,
  SchemaKind,
} from "@interactive-os/json-document";

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
  description?: SchemaDescription;
  canReplace: JSONCapabilityResult;
  canSet(value: unknown): JSONCapabilityResult;
  set(value: unknown): JSONResult | Exclude<JSONCapabilityResult, { ok: true }>;
}

export interface SchemaFormTreeField extends SchemaFormField {
  containerKind?: SchemaFormContainerKind;
  fields?: ReadonlyArray<SchemaFormTreeField>;
}

export type SchemaFormResult =
  | {
    ok: true;
    path: Pointer;
    kind: SchemaFormContainerKind;
    fields: ReadonlyArray<SchemaFormField>;
  }
  | SchemaFormError;

export type SchemaFormTreeResult =
  | {
    ok: true;
    path: Pointer;
    kind: SchemaFormContainerKind;
    fields: ReadonlyArray<SchemaFormTreeField>;
  }
  | SchemaFormError;

export interface SchemaFormEntry {
  key: string;
  path: Pointer;
  value: unknown;
}
