import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

export type GenerateSlugErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "source_not_string"
  | "patch_rejected"
  | "patch_failed";

export interface GenerateSlugError {
  ok: false;
  code: GenerateSlugErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface GenerateSlugOptions {
  /** Separator between words. Default `"-"`. */
  separator?: string;
  /** Lowercase the result. Default `true`. */
  lower?: boolean;
  /** Max length of the slug (trimmed at a separator boundary). */
  maxLength?: number;
}

export interface GenerateSlugChange {
  ok: true;
  /** Pointer the slug was written to. */
  target: Pointer;
  slug: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type GenerateSlugResult = GenerateSlugChange | GenerateSlugError;

export interface GenerateSlug<TDocument> {
  canGenerateSlug(source: Pointer, target: Pointer, options?: GenerateSlugOptions): GenerateSlugResult;
  generateSlug(source: Pointer, target: Pointer, options?: GenerateSlugOptions): GenerateSlugResult;
}
