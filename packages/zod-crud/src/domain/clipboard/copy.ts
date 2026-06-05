// verbs/copy — Clipboard 기둥 (read-only).
// (state, source) → { payload }. side effect 0.
// system clipboard write 는 hooks 또는 사용자 코드에서 수행 (boundary: ADR-0002 §0.4).

import type { Pointer } from "../../foundation/pointer/index.js";
import { jsonSerializableError } from "../../foundation/json/serializable.js";
import { cloneTrustedPlainJson } from "../../foundation/json/trustedClone.js";
import { readAt, tryParsePointer } from "../../foundation/pointer/index.js";
import { normalizePointerSources, type PointerSource } from "../../foundation/pointer/source.js";

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
  reason: string;
}

type CopyResult = CopyOk | CopyError;
export type ClipboardSource = PointerSource;

interface CopyOptions {
  trusted?: boolean;
  clonePayload?: boolean;
}

/**
 * selection 의 source pointer 위치의 값을 JSON fragment payload 로 추출한다.
 * pure. state 는 변하지 않는다 (read-only).
 */
export function copy(state: unknown, source: ClipboardSource, options: CopyOptions = {}): CopyResult {
  const sources = normalizeSources(source);
  if (!sources.ok) return sources;

  if (typeof source === "string") {
    return copyOne(state, source, sources.sources, options);
  }

  const payload: unknown[] = [];
  for (const item of sources.sources) {
    const r = copyOne(state, item, [item], options);
    if (!r.ok) return r;
    payload.push(r.payload);
  }
  return { ok: true, payload, source: sources.sources[0]!, sources: sources.sources };
}

function copyOne(
  state: unknown,
  source: Pointer,
  sources: ReadonlyArray<Pointer>,
  options: CopyOptions,
): CopyResult {
  const segments = tryParsePointer(source);
  if (segments === null) {
    return copyError("invalid_pointer", `invalid source pointer: ${source}`);
  }
  const r = readAt(state, segments);
  if (!r.ok) {
    return copyError("path_not_found", `source not found: ${source}`);
  }
  if (!options.trusted) {
    const jsonErr = jsonSerializableError(r.value);
    if (jsonErr) {
      return copyError("not_serializable", jsonErr);
    }
  }
  const payload = options.clonePayload === false ? r.value : cloneTrustedPlainJson(r.value);
  return { ok: true, payload, source, sources };
}

function normalizeSources(source: ClipboardSource): { ok: true; sources: Pointer[] } | CopyError {
  const result = normalizePointerSources(source);
  if (result.ok) return result;
  return result.code === "invalid_pointer"
    ? copyError("invalid_pointer", `invalid source pointer: ${result.pointer}`)
    : copyError("empty_selection", "copy source selection is empty");
}

function copyError(code: CopyError["code"], reason: string): CopyError {
  return { ok: false, code, reason };
}
