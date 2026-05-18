// SPEC.md §5.5 — 직렬화 헬퍼.

import * as z from "zod";
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
    const message = e instanceof Error ? e.message : "Invalid JSON";
    return {
      ok: false,
      error: new z.ZodError([{ code: "custom", path: [], message }]),
    };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, state: r.data as z.output<S> };
  return { ok: false, error: r.error };
}
