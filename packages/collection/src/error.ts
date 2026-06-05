import type {
  Pointer,
} from "zod-crud";

import type {
  CollectionError,
  CollectionErrorCode,
} from "./types.js";

export function collectionError(
  code: CollectionErrorCode,
  reason: string,
  pointer?: Pointer,
): CollectionError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
