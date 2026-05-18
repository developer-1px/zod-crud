// HTTP 어댑터 테스트 — RFC 5789 + 6902 + 7396.

import { describe, expect, test } from "vitest";
import {
  buildPatchRequest,
  withIfMatch,
  parsePatchResponse,
  parseMergePatch,
  applyMergePatch,
  JSON_PATCH_MIME,
  MERGE_PATCH_MIME,
} from "../src/sidecars/http.js";
import { applyPatch } from "../src/core/patch/index.js";
import { z } from "zod";

const PASS = z.unknown();

describe("RFC 6902 over HTTP — request", () => {
  test("buildPatchRequest 가 표준 헤더 + body 생성", () => {
    const ops = [{ op: "replace", path: "/a", value: 1 }] as const;
    const req = buildPatchRequest(ops);
    expect(req.method).toBe("PATCH");
    expect(req.headers["content-type"]).toBe(JSON_PATCH_MIME);
    expect(JSON.parse(req.body)).toEqual(ops);
  });

  test("buildPatchRequest 는 비JSON op value 를 body 손실 전에 거부", () => {
    expect(() => buildPatchRequest([{ op: "add", path: "/a", value: undefined }])).toThrow(TypeError);
  });

  test("withIfMatch 가 RFC 5789 §2.4 conditional 헤더 추가", () => {
    const req = buildPatchRequest([]);
    const conditional = withIfMatch(req, '"abc123"');
    expect(conditional.headers["if-match"]).toBe('"abc123"');
    expect(conditional.headers["content-type"]).toBe(JSON_PATCH_MIME);
  });
});

describe("RFC 6902 over HTTP — response (json-patch)", () => {
  test("application/json-patch+json 그대로 파싱", () => {
    const body = JSON.stringify([{ op: "add", path: "/a", value: 1 }]);
    const r = parsePatchResponse(body, JSON_PATCH_MIME);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ops).toEqual([{ op: "add", path: "/a", value: 1 }]);
  });

  test("content-type 의 charset suffix 무시", () => {
    const body = JSON.stringify([{ op: "remove", path: "/x" }]);
    const r = parsePatchResponse(body, `${JSON_PATCH_MIME}; charset=utf-8`);
    expect(r.ok).toBe(true);
  });

  test("body 가 array 가 아니면 거부", () => {
    const r = parsePatchResponse('{"op":"add"}', JSON_PATCH_MIME);
    expect(r.ok).toBe(false);
  });

  test("각 op shape 이 RFC 6902 필수 필드를 만족해야 한다", () => {
    expect(parsePatchResponse(JSON.stringify([{ op: "add", value: 1 }]), JSON_PATCH_MIME)).toEqual({
      ok: false,
      reason: "json-patch op[0] missing 'path'",
    });
    expect(parsePatchResponse(JSON.stringify([{ op: "add", path: "/a" }]), JSON_PATCH_MIME)).toEqual({
      ok: false,
      reason: "json-patch op[0] missing 'value' for op 'add'",
    });
    expect(parsePatchResponse(JSON.stringify([{ op: "move", path: "/a" }]), JSON_PATCH_MIME)).toEqual({
      ok: false,
      reason: "json-patch op[0] missing 'from' for op 'move'",
    });
  });

  test("path 와 from 은 JSON Pointer 문법이어야 한다", () => {
    expect(parsePatchResponse(JSON.stringify([{ op: "remove", path: "a" }]), JSON_PATCH_MIME)).toEqual({
      ok: false,
      reason: "json-patch op[0] invalid 'path': JSON Pointer must be empty or start with '/': \"a\"",
    });
    expect(parsePatchResponse(JSON.stringify([{ op: "move", from: "a", path: "/b" }]), JSON_PATCH_MIME)).toEqual({
      ok: false,
      reason: "json-patch op[0] invalid 'from': JSON Pointer must be empty or start with '/': \"a\"",
    });
  });

  test("invalid JSON body 거부", () => {
    const r = parsePatchResponse("not json", JSON_PATCH_MIME);
    expect(r.ok).toBe(false);
  });

  test("미지원 content-type 거부", () => {
    const r = parsePatchResponse("[]", "application/json");
    expect(r.ok).toBe(false);
  });
});

describe("RFC 7396 — merge-patch → 6902 변환", () => {
  test("§2 예제 1 — value 변경", () => {
    const ops = parseMergePatch({ a: "b", c: { d: "e" } }, "");
    // {} 시작 → /a = "b", /c/d = "e"
    const r = applyPatch(PASS as never, {} as never, ops);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect(r.state).toEqual({ a: "b", c: { d: "e" } });
  });

  test("§2 예제 2 — null 은 remove", () => {
    const ops = parseMergePatch({ a: null }, "");
    const r = applyPatch(PASS as never, { a: 1, b: 2 } as never, ops);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect(r.state).toEqual({ b: 2 });
  });

  test("§2 — array 는 통째 교체 (per-element merge X)", () => {
    const ops = parseMergePatch({ items: [1, 2, 3] }, "");
    const r = applyPatch(PASS as never, { items: [9, 8] } as never, ops);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect((r.state as { items: number[] }).items).toEqual([1, 2, 3]);
  });

  test("§2 — root 가 non-object 면 root replace", () => {
    const ops = parseMergePatch(42, "");
    const r = applyPatch(PASS as never, { a: 1 } as never, ops);
    expect(r.result.ok).toBe(true);
    if (r.result.ok) expect(r.state).toBe(42);
  });

  test("nested null = nested remove (applyMergePatch 직접 사용 — stateful)", () => {
    // parseMergePatch 는 target 컨텍스트 없이 6902 ops 로 분해 — nested null 의미 보존 못함.
    // applyMergePatch 가 정확한 RFC 7396 의미.
    const result = applyMergePatch({ a: { b: 1, c: 0 } }, { a: { b: null, c: 2 } });
    expect(result).toEqual({ a: { c: 2 } });
  });

  test("merge-patch via parsePatchResponse + apply round-trip", () => {
    const body = JSON.stringify({ name: "alice", age: null });
    const r = parsePatchResponse(body, MERGE_PATCH_MIME);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const applied = applyPatch(PASS as never, { name: "bob", age: 30 } as never, r.ops);
      expect(applied.result.ok).toBe(true);
      if (applied.result.ok) expect(applied.state).toEqual({ name: "alice" });
    }
  });

  test("키에 / 또는 ~ 가 있으면 escape", () => {
    const ops = parseMergePatch({ "a/b": 1, "c~d": 2 }, "");
    expect(ops).toEqual([
      { op: "add", path: "/a~1b", value: 1 },
      { op: "add", path: "/c~0d", value: 2 },
    ]);
  });
});
