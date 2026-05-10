// core/schema/validate — dev-only assertion (전체 state 검증).
// preFlight 가 잡지 못한 케이스 (branch-only 누락 / cross-field refinement) 를 위한
// defensive guard. prod 빌드에서는 no-op.

import type * as z from "zod";

declare const process: { env?: { NODE_ENV?: string } } | undefined;
const isDev =
  typeof process === "undefined" ||
  process?.env?.NODE_ENV !== "production";

export interface ValidateOk {
  ok: true;
}

export interface ValidateErr {
  ok: false;
  message: string;
  violations: ReadonlyArray<{ path: string; message: string }>;
}

export type ValidateResult = ValidateOk | ValidateErr;

/**
 * dev build 만 동작. prod 에서는 항상 ok.
 * preFlight 가 통과한 후의 state 가 schema 와 정합한지 마지막 확인.
 * 실패 시 라이브러리 자체 버그 (또는 schema/Zod 불일치) 가능성 — assertion 실패로 다룰 것.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  state: unknown,
): ValidateResult {
  if (!isDev) return { ok: true };
  const parsed = schema.safeParse(state);
  if (parsed.success) return { ok: true };
  return {
    ok: false,
    message: "post-commit validate failed (dev assertion)",
    violations: parsed.error.issues.map((i) => ({
      path: "/" + i.path.map(String).join("/"),
      message: i.message,
    })),
  };
}
