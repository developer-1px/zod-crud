// domain/schema/patchPreflight — patch 적용 전 schema gate.
// (state, patch, schema) → Ok(draft) | Err(violations).
// dry-apply 후 전체 schema.safeParse 를 실행한다.
// cross-field refine/superRefine 위반도 commit 전에 schema_violation 으로 거부한다.

import * as z from "zod";
import { applyPatch } from "../../foundation/json-patch/applyPublic.js";
import type {
  ApplyResult,
  JSONPatchOperation,
  ErrorCode,
} from "../../foundation/json-patch/types.js";
import { buildPointer } from "../../foundation/json-pointer/pointerCore.js";

export interface PatchPreflightOk<T> {
  ok: true;
  draft: T;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export type PatchPreflightErrorCode = ErrorCode | "preflight_failed";

export interface PatchPreflightErr {
  ok: false;
  code: PatchPreflightErrorCode;
  message: string;
  violations: ReadonlyArray<{ path: string; message: string }>;
}

export type PatchPreflightResult<T> = PatchPreflightOk<T> | PatchPreflightErr;

/**
 * patch 가 commit 되기 전에 schema 위반 여부를 검증한다.
 * 실패 시 commit 하지 않는다 — history 오염 0.
 */
export function patchPreflight<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  patch: ReadonlyArray<JSONPatchOperation>,
): PatchPreflightResult<z.output<S>> {
  return patchPreflightFromApplyResult(applyPatch(schema, state, patch));
}

export function patchPreflightFromApplyResult<S extends z.ZodType>(
  r: ApplyResult<S>,
): PatchPreflightResult<z.output<S>> {
  if (r.result.ok) {
    return { ok: true, draft: r.state, applied: r.applied };
  }
  // schema_violation 또는 다른 RFC 6902 op 실패. patchPreflight 가 거부 — 호출자가 처리.
  // schema_violation 의 경우 result.reason 에 zod issues JSON 이 들어있다 (foundation/json-patch §applyPatch).
  return {
    ok: false,
    code: r.result.code,
    message: (r.result as { reason?: string }).reason ?? "patchPreflight failed",
    violations: parseViolations(r.result),
  };
}

/** foundation/json-patch.applyPatch 의 schema_violation reason 에 든 zod issues JSON 을 파싱. */
function parseViolations(
  result: { code: string; reason?: string },
): ReadonlyArray<{ path: string; message: string }> {
  if (result.code !== "schema_violation" || !result.reason) return [];
  try {
    const issues = JSON.parse(result.reason);
    if (!Array.isArray(issues)) return [];
    return issues.map((i: { path?: unknown[]; message?: string }) => ({
      path: buildPointer((i.path ?? []).map(String)),
      message: i.message ?? "",
    }));
  } catch {
    return [];
  }
}
