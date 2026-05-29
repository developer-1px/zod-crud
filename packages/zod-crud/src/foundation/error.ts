// JSONCrudError + strict/onError policy 'handle'.
// JSON operation error handling policy 분리. boundary 표면 (index.ts 에서 re-export).

import type { JSONPatchOperation, JSONResult } from "./patch/types.js";

export type JSONCrudOpLabel = JSONPatchOperation | "load" | "reset" | "patch";

export class JSONCrudError extends Error {
  override readonly name = "JSONCrudError";
  constructor(
    public readonly op: JSONCrudOpLabel,
    public readonly result: Extract<JSONResult, { ok: false }>,
  ) {
    super(`zod-crud ${formatOp(op)} failed: ${result.code}${result.reason ? ` — ${result.reason}` : ""}`);
  }
}

function formatOp(op: JSONCrudOpLabel): string {
  return typeof op === "string" ? op : op.op;
}

export interface ErrorPolicy {
  strict?: boolean | undefined;
  onError?: (error: JSONCrudError) => void;
}

/** strict 면 throw, 아니면 onError 콜 후 result 반환. */
export function handleResult(
  policy: ErrorPolicy,
  op: JSONCrudOpLabel,
  result: JSONResult,
): JSONResult {
  if (result.ok) return result;
  const strict = policy.strict === true;
  if (policy.onError) {
    policy.onError(new JSONCrudError(op, result));
  }
  if (strict) {
    throw new JSONCrudError(op, result);
  }
  return result;
}
