// JSONDocumentError + strict/onError policy 'handle'.
// JSON operation error handling policy 분리. boundary 표면 (index.ts 에서 re-export).

import type { JSONPatchOperation, JSONResult } from "./patch/contract.js";

export type JSONDocumentOpLabel = JSONPatchOperation | "load" | "reset" | "patch";

export class JSONDocumentError extends Error {
  override readonly name = "JSONDocumentError";
  constructor(
    public readonly op: JSONDocumentOpLabel,
    public readonly result: Extract<JSONResult, { ok: false }>,
  ) {
    super(`json-document ${typeof op === "string" ? op : op.op} failed: ${result.code}${result.reason ? ` — ${result.reason}` : ""}`);
  }
}

export interface ErrorPolicy {
  strict?: boolean | undefined;
  onError?: (error: JSONDocumentError) => void;
}

/** strict 면 throw, 아니면 onError 콜 후 result 반환. */
export function handleResult(
  policy: ErrorPolicy,
  op: JSONDocumentOpLabel,
  result: JSONResult,
): JSONResult {
  if (result.ok) return result;
  const strict = policy.strict === true;
  if (policy.onError) {
    policy.onError(new JSONDocumentError(op, result));
  }
  if (strict) {
    throw new JSONDocumentError(op, result);
  }
  return result;
}
