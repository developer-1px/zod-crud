// verbs/copy — Clipboard 기둥 (read-only).
// (state, source) → { payload }. side effect 0.
// system clipboard write 는 hooks 또는 사용자 코드에서 수행 (boundary: ADR-0002 §0.4).

import type { Pointer } from "../core/pointer/index.js";
import { cloneJson, jsonSerializableError } from "../core/json.js";
import { readAt, tryParsePointer } from "../core/pointer/index.js";
import { normalizePointerSources, type PointerSource, type PointerSourceError } from "../core/pointer/sourceSet.js";

export interface CopyOk {
  ok: true;
  /** RFC 8259 JSON 직렬화 가능한 fragment. 호출자가 navigator.clipboard.writeText(JSON.stringify(payload)) 로 외부 round-trip. */
  payload: unknown;
  /** Primary source. Multi-source copy keeps the first selected source here for single-source compatibility. */
  source: Pointer;
  /** All copied sources, in caller/selection order. */
  sources: ReadonlyArray<Pointer>;
}

export interface CopyError {
  ok: false;
  code: "empty_selection" | "invalid_pointer" | "path_not_found" | "not_serializable";
  message: string;
}

type CopyResult = CopyOk | CopyError;
export type ClipboardSource = PointerSource;

/**
 * selection 의 source pointer 위치의 값을 JSON fragment payload 로 추출한다.
 * pure. state 는 변하지 않는다 (read-only).
 */
export function copy(state: unknown, source: ClipboardSource): CopyResult {
  const sources = normalizeSources(source);
  if (!sources.ok) return sources;

  if (typeof source === "string") {
    return copyOne(state, source, sources.sources);
  }

  const payload: unknown[] = [];
  for (const item of sources.sources) {
    const r = copyOne(state, item, [item]);
    if (!r.ok) return r;
    payload.push(r.payload);
  }
  return { ok: true, payload, source: sources.sources[0]!, sources: sources.sources };
}

function copyOne(state: unknown, source: Pointer, sources: ReadonlyArray<Pointer>): CopyResult {
  const segments = tryParsePointer(source);
  if (segments === null) {
    return { ok: false, code: "invalid_pointer", message: `invalid source pointer: ${source}` };
  }
  const r = readAt(state, segments);
  if (!r.ok) {
    return { ok: false, code: "path_not_found", message: `source not found: ${source}` };
  }
  const jsonErr = jsonSerializableError(r.value);
  if (jsonErr) {
    return { ok: false, code: "not_serializable", message: jsonErr };
  }
  // deep clone via JSON round-trip — payload 가 외부 round-trip 후에도 정합한지 보장.
  return { ok: true, payload: cloneJson(r.value), source, sources };
}

function normalizeSources(source: ClipboardSource): { ok: true; sources: Pointer[] } | CopyError {
  const result = normalizePointerSources(source);
  return result.ok ? result : copySourceError(result);
}

function copySourceError(error: PointerSourceError): CopyError {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", message: `invalid source pointer: ${error.pointer}` }
    : { ok: false, code: "empty_selection", message: "copy source selection is empty" };
}
