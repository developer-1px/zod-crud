// verbs/paste — Clipboard 기둥. payload + target/mode → RFC 6902 add patch.
// (schema, state, payload, target, mode) → { next, patch }.
// hooks/useJsonDocument 가 selection 을 자동 주입 (ADR-0002 §0.5).

import type * as z from "zod";
import type { JsonPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { preFlight } from "../core/schema/preFlight.js";

export type PasteMode = "before" | "after" | "into" | "replace";

export interface PasteOk<T> {
  ok: true;
  next: T;
  patch: JsonPatchOperation[];
}

export interface PasteError {
  ok: false;
  code: string;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export function paste<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  payload: unknown,
  target: Pointer,
  mode: PasteMode = "into",
): PasteOk<z.output<S>> | PasteError {
  const op = buildPasteOp(payload, target, mode);
  const r = preFlight(schema, state, [op]);
  if (!r.ok) {
    return { ok: false, code: r.code, message: r.message, violations: r.violations };
  }
  return { ok: true, next: r.draft, patch: [op] };
}

function buildPasteOp(payload: unknown, target: Pointer, mode: PasteMode): JsonPatchOperation {
  switch (mode) {
    case "replace":
      return { op: "replace", path: target, value: payload };
    case "before":
      return { op: "add", path: target, value: payload };
    case "after": {
      // /items/3 → /items/4. array index 만 안전하게 처리. object 는 사용자가 명시 path 권장.
      const m = target.match(/^(.*\/)([0-9]+)$/);
      if (m) {
        const next = String(Number(m[2]) + 1);
        return { op: "add", path: m[1] + next, value: payload };
      }
      return { op: "add", path: target, value: payload };
    }
    case "into":
    default:
      // collapsed selection / 빈 위치 — add 그대로. 배열의 `/-` 도 자연 처리.
      return { op: "add", path: target, value: payload };
  }
}
