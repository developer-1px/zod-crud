// verbs/copy — Clipboard 기둥 (read-only).
// (state, source) → { payload }. side effect 0.
// system clipboard write 는 hooks 또는 사용자 코드에서 수행 (boundary: ADR-0002 §0.4).

import type { Pointer } from "../core/pointer/index.js";
import { parsePointer, readAt } from "../core/pointer/index.js";

export interface CopyOk {
  ok: true;
  /** RFC 8259 JSON 직렬화 가능한 fragment. 호출자가 navigator.clipboard.writeText(JSON.stringify(payload)) 로 외부 round-trip. */
  payload: unknown;
  source: Pointer;
}

export interface CopyError {
  ok: false;
  code: "path_not_found";
  message: string;
}

export type CopyResult = CopyOk | CopyError;

/**
 * selection 의 source pointer 위치의 값을 JSON fragment payload 로 추출한다.
 * pure. state 는 변하지 않는다 (read-only).
 */
export function copy(state: unknown, source: Pointer): CopyResult {
  const segments = parsePointer(source);
  const r = readAt(state, segments);
  if (!r.ok) {
    return { ok: false, code: "path_not_found", message: `source not found: ${source}` };
  }
  // deep clone via JSON round-trip — payload 가 외부 round-trip 후에도 정합한지 보장.
  return { ok: true, payload: JSON.parse(JSON.stringify(r.value)), source };
}
