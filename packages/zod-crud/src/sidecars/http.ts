// SPEC §5 — HTTP transport for RFC 6902 patches.
// 선택적 import. 트리쉐이킹 보장. 표면 = 4 개 함수.
//
//   parsePatchResponse  ─ 응답 body + content-type → JSONPatchOperation[]
//   buildPatchRequest   ─ ops → { headers, body }
//   withIfMatch         ─ ETag 조건부 PATCH (RFC 5789 §2.4)
//   parseMergePatch     ─ RFC 7396 merge-patch → RFC 6902 ops 변환
//
// 외부 의존 0 — fetch / axios / 다른 client 와 직접 결합하지 않는다.
// 사용자가 client 를 가지고 와서 wiring 한다.

import type { JSONPatchOperation } from "../core/patch/index.js";
import { parsePointer } from "../core/pointer/index.js";
import { assertJsonSerializable, cloneJson } from "../core/json.js";

export const JSON_PATCH_MIME = "application/json-patch+json";    // RFC 6902 §6
export const MERGE_PATCH_MIME = "application/merge-patch+json";  // RFC 7396

export interface PatchRequest {
  method: "PATCH";
  headers: Record<string, string>;
  body: string;
}

/**
 * RFC 6902 §6 — `application/json-patch+json` 으로 직렬화된 PATCH 요청 build.
 * fetch / axios 등 client 의 옵션으로 spread 하면 된다.
 */
export function buildPatchRequest(ops: ReadonlyArray<JSONPatchOperation>): PatchRequest {
  assertJsonSerializable(ops);
  return {
    method: "PATCH",
    headers: { "content-type": JSON_PATCH_MIME },
    body: JSON.stringify(ops),
  };
}

/**
 * RFC 5789 §2.4 — ETag 기반 조건부 PATCH. 서버가 동일 etag 를 가진 자원에만 적용.
 * mid-air collision (다른 클라이언트가 먼저 변경) 방지.
 */
export function withIfMatch(req: PatchRequest, etag: string): PatchRequest {
  return { ...req, headers: { ...req.headers, "if-match": etag } };
}

export interface ParseResult {
  ok: true;
  ops: JSONPatchOperation[];
}

export interface ParseError {
  ok: false;
  reason: string;
}

/**
 * 응답 body + content-type 을 RFC 6902 ops 로 정규화.
 * - `application/json-patch+json`         그대로 파싱
 * - `application/merge-patch+json`        RFC 7396 → RFC 6902 변환
 * - 그 외                                  거부
 */
export function parsePatchResponse(body: string, contentType: string | null | undefined): ParseResult | ParseError {
  const ct = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    return { ok: false, reason: `body is not valid JSON: ${(e as Error).message}` };
  }
  if (ct === JSON_PATCH_MIME) {
    if (!Array.isArray(raw)) return { ok: false, reason: "json-patch body must be an array" };
    const ops: JSONPatchOperation[] = [];
    for (let i = 0; i < raw.length; i++) {
      const op = parseJsonPatchOperation(raw[i], i);
      if (!op.ok) return op;
      ops.push(op.operation);
    }
    return { ok: true, ops };
  }
  if (ct === MERGE_PATCH_MIME) {
    return { ok: true, ops: parseMergePatch(raw, "") };
  }
  return { ok: false, reason: `unsupported content-type: ${contentType}` };
}

type PatchOpParseResult =
  | { ok: true; operation: JSONPatchOperation }
  | { ok: false; reason: string };

const JSON_PATCH_OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);

function parseJsonPatchOperation(value: unknown, index: number): PatchOpParseResult {
  const fail = (reason: string): PatchOpParseResult => ({ ok: false, reason: `json-patch op[${index}] ${reason}` });
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("must be an object");

  const op = value as Record<string, unknown>;
  const opName = op.op;
  if (typeof opName !== "string" || !JSON_PATCH_OPS.has(opName)) return fail(`has unrecognized op: ${String(opName)}`);
  if (typeof op.path !== "string") return fail("missing 'path'");
  const pathError = validatePointerSyntax(op.path);
  if (pathError) return fail(`invalid 'path': ${pathError}`);

  if ((opName === "add" || opName === "replace" || opName === "test") && !("value" in op)) {
    return fail(`missing 'value' for op '${opName}'`);
  }
  if ((opName === "move" || opName === "copy") && typeof op.from !== "string") {
    return fail(`missing 'from' for op '${opName}'`);
  }
  if ((opName === "move" || opName === "copy") && typeof op.from === "string") {
    const fromError = validatePointerSyntax(op.from);
    if (fromError) return fail(`invalid 'from': ${fromError}`);
  }

  return { ok: true, operation: op as JSONPatchOperation };
}

function validatePointerSyntax(pointer: string): string | null {
  try {
    parsePointer(pointer);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * RFC 7396 — merge patch 의미를 RFC 6902 ops 로 분해 (top-level only).
 *
 * 규칙 (§2):
 *   - root 가 non-object: 전체 replace
 *   - object: 각 key 에 대해
 *     - value 가 null → remove
 *     - 그 외 (primitive · array · object) → add (whole subtree)
 *
 * 한계: nested null = nested remove 는 target 컨텍스트 없이 6902 ops 로 분해 불가
 *      (RFC 7396 merge 는 stateful). nested merge 가 필요하면 `applyMergePatch`
 *      를 직접 사용한다.
 */
export function parseMergePatch(patch: unknown, basePath: string): JSONPatchOperation[] {
  assertJsonSerializable(patch);
  const basePathError = validatePointerSyntax(basePath);
  if (basePathError) throw new TypeError(`basePath must be a JSON Pointer: ${basePathError}`);
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return [{ op: "replace", path: basePath, value: patch }];
  }
  const out: JSONPatchOperation[] = [];
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const path = `${basePath}/${escapeMergeKey(k)}`;
    if (v === null) out.push({ op: "remove", path });
    else out.push({ op: "add", path, value: v });
  }
  return out;
}

/**
 * RFC 7396 — merge patch 를 target 에 직접 적용. nested merge·null-remove 모두 정확.
 * Pure: target 미변경, 새 객체 반환.
 */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  assertJsonSerializable(target);
  assertJsonSerializable(patch);
  return applyMergePatchUnchecked(target, patch);
}

function applyMergePatchUnchecked(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    return cloneJson(patch);
  }
  const isTargetObject = target !== null && typeof target === "object" && !Array.isArray(target);
  const out: Record<string, unknown> = isTargetObject ? cloneJson(target as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === null) {
      delete out[k];
    } else if (typeof v === "object" && !Array.isArray(v)) {
      out[k] = applyMergePatchUnchecked(out[k], v);
    } else {
      out[k] = cloneJson(v);
    }
  }
  return out;
}

function escapeMergeKey(k: string): string {
  return k.replace(/~/g, "~0").replace(/\//g, "~1");
}
