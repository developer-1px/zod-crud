// RFC 6902 conformance — github.com/json-patch/json-patch-tests vendor.
// 인증의 사실상 게이트. 모든 통과 또는 명시 deviation.

import { describe, expect, test } from "vitest";
import { z } from "zod";
import { applyPatch, type JSONPatchOperation } from "../src/core/patch/index.js";
import tests from "./conformance/tests.json" with { type: "json" };
import specTests from "./conformance/spec_tests.json" with { type: "json" };

interface Case {
  comment?: string;
  doc: unknown;
  patch: JSONPatchOperation[];
  expected?: unknown;
  error?: string;
  disabled?: boolean;
}

// schema-free conformance: zod 검증 우회 위해 임의 schema (passthrough).
const PASS = z.unknown();

function runCase(c: Case): { ok: true; result: unknown } | { ok: false; error: string } {
  // doc 의 원래 타입을 그대로 유지 — applyPatch 는 z.output<S> 타입 가정이지만
  // PASS schema 가 unknown 통과시킴.
  const r = applyPatch(PASS as never, c.doc as never, c.patch);
  if (r.result.ok) return { ok: true, result: r.state };
  return { ok: false, error: `${r.result.code}${r.result.reason ? `: ${r.result.reason}` : ""}` };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// 객체 키 순서 정규화 (RFC 6902 는 객체 멤버 순서 무관).
function canonical(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonical);
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) out[k] = canonical(o[k]);
  return out;
}

const allCases: Case[] = [...(tests as Case[]), ...(specTests as Case[])];

describe("RFC 6902 conformance — json-patch/json-patch-tests vendor", () => {
  let passed = 0;
  let failed = 0;
  let disabled = 0;

  for (const [i, c] of allCases.entries()) {
    const label = `[${i}] ${c.comment ?? "(no comment)"}`;
    if (c.disabled) {
      test.skip(label, () => {});
      disabled++;
      continue;
    }
    test(label, () => {
      const r = runCase(c);
      if ("expected" in c) {
        // 성공 케이스
        expect(r.ok).toBe(true);
        if (r.ok) expect(deepEqual(r.result, c.expected)).toBe(true);
        if (r.ok && deepEqual(r.result, c.expected)) passed++;
        else failed++;
      } else if (c.error !== undefined) {
        // 실패 케이스 — 우리가 거부해야 함
        expect(r.ok).toBe(false);
        if (!r.ok) passed++;
        else failed++;
      } else {
        // expected 도 error 도 없음 — comment-only? skip
        passed++;
      }
    });
  }

  test("conformance summary", () => {
    // eslint-disable-next-line no-console
    console.log(`RFC 6902 conformance: ${passed}/${allCases.length - disabled} passed (${disabled} disabled)`);
  });
});
