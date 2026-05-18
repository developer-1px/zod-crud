// core/schema/preFlight — patch 적용 전 schema gate.
// (state, patch, schema) → Ok(draft) | Err(violations).
// branch-only 검증 정책 — patch 가 닿는 가지만 zod.safeParse (Q11 합의).
//
// 현재 구현 메모: 1차 구현은 dry-apply + 전체 safeParse 로 동치 결과 산출.
// branch-only optimization (Pointer path → sub-schema descent) 는 후속 개선에서.
// API 표면은 branch-only contract 그대로 유지하므로 호출자 코드는 변경 없음.

import * as z from "zod";
import { applyPatch, type JSONPatchOperation, type ErrorCode } from "../patch/index.js";

export interface PreFlightOk<T> {
  ok: true;
  draft: T;
}

export interface PreFlightErr {
  ok: false;
  code: ErrorCode | "preFlight_failed";
  message: string;
  violations: ReadonlyArray<{ path: string; message: string }>;
}

export type PreFlightResult<T> = PreFlightOk<T> | PreFlightErr;

/**
 * patch 가 commit 되기 전에 schema 위반 여부를 검증한다.
 * branch-only 정책: cross-field refinement (.refine / .superRefine) 는 보호 밖.
 *   사용자가 cross-field 보호를 원하면 별도 commit-후 검증 wiring 필요.
 *
 * 실패 시 commit 하지 않는다 — history 오염 0.
 */
export function preFlight<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  patch: ReadonlyArray<JSONPatchOperation>,
): PreFlightResult<z.output<S>> {
  const r = applyPatch(schema, state, patch);
  if (r.result.ok) {
    return { ok: true, draft: r.state };
  }
  // schema_violation 또는 다른 RFC 6902 op 실패. preFlight 가 거부 — 호출자가 처리.
  // schema_violation 의 경우 result.reason 에 zod issues JSON 이 들어있다 (core/patch §applyPatch).
  return {
    ok: false,
    code: r.result.code,
    message: (r.result as { reason?: string }).reason ?? "preFlight failed",
    violations: parseViolations(r.result),
  };
}

/** core/patch.applyPatch 의 schema_violation reason 에 든 zod issues JSON 을 파싱. */
function parseViolations(
  result: { code: string; reason?: string },
): ReadonlyArray<{ path: string; message: string }> {
  if (result.code !== "schema_violation" || !result.reason) return [];
  try {
    const issues = JSON.parse(result.reason);
    if (!Array.isArray(issues)) return [];
    return issues.map((i: { path?: unknown[]; message?: string }) => ({
      path: "/" + (i.path ?? []).map(String).join("/"),
      message: i.message ?? "",
    }));
  } catch {
    return [];
  }
}
