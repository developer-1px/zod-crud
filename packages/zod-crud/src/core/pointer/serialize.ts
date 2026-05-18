// SPEC.md §5.5 — 직렬화 헬퍼.

import type * as z from "zod";
import { assertJsonSerializable } from "../json.js";

export function serialize<T>(state: T): string {
  assertJsonSerializable(state);
  return JSON.stringify(state);
}

export function parse<S extends z.ZodType>(schema: S, json: string): z.output<S> {
  return schema.parse(JSON.parse(json)) as z.output<S>;
}

export function safeParse<S extends z.ZodType>(
  schema: S,
  json: string,
): { ok: true; state: z.output<S> } | { ok: false; error: z.ZodError } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    // JSON.parse 실패는 ZodError 형식이 아니므로 schema.safeParse로 통일.
    const r = schema.safeParse(undefined);
    if (!r.success) return { ok: false, error: r.error };
    throw e;
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, state: r.data as z.output<S> };
  return { ok: false, error: r.error };
}
