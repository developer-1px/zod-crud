import type { JSONCapabilityResult, JSONChangeMetadata, JSONPatchOperation, JSONResult, Pointer } from "@interactive-os/json-document";

export type BlockTypeConversionErrorCode =
  | "factory_failed"
  | "invalid_target"
  | "invalid_target_type"
  | "patch_failed"
  | "patch_rejected"
  | "unsupported_type";

export interface BlockTypeConversionDescriptor {
  targetTypes: ReadonlyArray<string>;
  readType(value: unknown, pointer: Pointer): string | undefined;
  canConvert?(input: BlockTypeConversionFactoryInput): boolean | string;
  createValue(input: BlockTypeConversionFactoryInput): unknown;
}

export interface BlockTypeConversionInput {
  pointer: Pointer;
  to: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface BlockTypeConversionFactoryInput {
  pointer: Pointer;
  from: string;
  to: string;
  value: unknown;
  data?: Readonly<Record<string, unknown>>;
}

export interface BlockTypeConversionPlan {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  operation: JSONPatchOperation;
}

export interface BlockTypeConversionError {
  ok: false;
  code: BlockTypeConversionErrorCode;
  reason: string;
  pointer?: Pointer;
  from?: string;
  to?: string;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export type BlockTypeConversionPlanResult =
  | BlockTypeConversionPlan
  | BlockTypeConversionError;

export type BlockTypeConversionResult =
  | { ok: true; pointer: Pointer; from: string; to: string; operation: JSONPatchOperation; result: JSONResult }
  | BlockTypeConversionError;

export interface BlockTypeConverter<TDocument> {
  canConvert(input: BlockTypeConversionInput): BlockTypeConversionPlanResult;
  convert(input: BlockTypeConversionInput, metadata?: JSONChangeMetadata): BlockTypeConversionResult;
}
