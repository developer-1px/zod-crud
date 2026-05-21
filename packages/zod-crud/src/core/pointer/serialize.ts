// SPEC.md §5.5 — 직렬화 헬퍼.

import { assertJsonSerializable } from "../json.js";

export function serialize<T>(state: T): string {
  assertJsonSerializable(state);
  return JSON.stringify(state);
}
