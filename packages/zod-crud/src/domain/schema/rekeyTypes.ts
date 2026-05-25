export type RekeyStrategy = "suffix" | "uuid" | ((value: unknown, ctx: RekeyContext) => string);

export interface RekeyContext {
  field: string;
  existing: ReadonlySet<string>;
  attempt: number;
}

export interface RekeyOptions {
  fields: string[];
  strategy: RekeyStrategy;
}

export type RekeyErrorCode = "not_serializable" | "rekey_failed";
export type RekeyResult = { ok: true; payload: unknown } | { ok: false; code: RekeyErrorCode; message: string };

export interface RekeyExecutionOptions {
  trustedPayload?: boolean | undefined;
}

export interface RekeyField {
  field: string;
  existing: Set<string>;
}
