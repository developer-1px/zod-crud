// JSONCrudError + strict/onError policy 'handle'.
// useJSON 의 에러 처리 정책을 분리. boundary 표면 (index.ts 에서 re-export).

import type { JSONPatchOperation, JSONResult } from "./core/patch/index.js";

export type JSONCrudOpLabel = JSONPatchOperation | "load" | "reset" | "patch" | "set";

export class JSONCrudError extends Error {
  override readonly name = "JSONCrudError";
  constructor(
    public readonly op: JSONCrudOpLabel,
    public readonly result: Extract<JSONResult, { ok: false }>,
  ) {
    super(`useJSON failed: ${result.code}${result.reason ? ` — ${result.reason}` : ""}`);
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
  onError?: (error: JSONCrudError) => void;
}

/** strict 면 throw, 아니면 onError 콜 후 result 반환. */
export function handleResult(
  policy: ErrorPolicy,
  op: JSONCrudOpLabel,
  result: JSONResult,
): JSONResult {
  if (result.ok) return result;
  const strict = policy.strict ?? !isProd;
  if (policy.onError) {
    policy.onError(new JSONCrudError(op, result));
  }
  if (strict) {
    throw new JSONCrudError(op, result);
  }
  return result;
}
