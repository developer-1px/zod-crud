// JsonCrudError + strict/onError policy 'handle'.
// useJson 의 에러 처리 정책을 분리. boundary 표면 (index.ts 에서 re-export).

import type { JsonPatchOperation, JsonResult } from "../core/patch/index.js";

export type JsonCrudOpLabel = JsonPatchOperation | "load" | "reset" | "patch";

export class JsonCrudError extends Error {
  override readonly name = "JsonCrudError";
  constructor(
    public readonly op: JsonCrudOpLabel,
    public readonly result: Extract<JsonResult, { ok: false }>,
  ) {
    super(`useJson failed: ${result.code}${result.reason ? ` — ${result.reason}` : ""}`);
  }
}

declare const process: { env?: { NODE_ENV?: string } } | undefined;
const isProd = ((): boolean => {
  try {
    return typeof process !== "undefined" && process?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
})();

export interface ErrorPolicy {
  strict?: boolean;
  onError?: (error: JsonCrudError) => void;
}

/** strict 면 throw, 아니면 onError 콜 후 result 반환. */
export function handleResult(
  policy: ErrorPolicy,
  op: JsonCrudOpLabel,
  result: JsonResult,
): JsonResult {
  if (result.ok) return result;
  const strict = policy.strict ?? !isProd;
  if (policy.onError) {
    policy.onError(new JsonCrudError(op, result));
  }
  if (strict) {
    throw new JsonCrudError(op, result);
  }
  return result;
}
