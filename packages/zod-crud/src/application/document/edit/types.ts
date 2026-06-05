import type { DuplicateError as DomainDuplicateError, DuplicateOpts } from "../../../domain/edit/duplicate.js";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import type { Pointer } from "../../../foundation/pointer/index.js";

export type JSONDocumentDuplicateOptions = DuplicateOpts;
export type JSONDocumentDuplicateError = DomainDuplicateError;
export type JSONDocumentDuplicateResult<T> =
  | {
      ok: true;
      value: T;
      applied: ReadonlyArray<JSONPatchOperation>;
      duplicatedTo: Pointer;
    }
  | JSONDocumentDuplicateError
  | Extract<JSONResult, { ok: false }>;
