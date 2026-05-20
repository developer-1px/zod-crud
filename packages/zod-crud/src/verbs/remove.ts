// verbs/remove — structural JSON deletion without clipboard payload.
// (schema, state, source) → { next, patch }. Source may be one pointer or a
// normalized multi-source selection.

import type * as z from "zod";
import type { JSONPatchOperation } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { tryParsePointer } from "../core/pointer/index.js";
import { normalizePointerSources, type PointerSource, type PointerSourceError } from "../core/pointer/sourceSet.js";
import { preFlight, type PreFlightErrorCode } from "../core/schema/preFlight.js";

export type RemoveSource = PointerSource;

export interface RemoveOk<T> {
  ok: true;
  next: T;
  patch: JSONPatchOperation[];
  /** Primary removed source. Multi-source remove keeps the first selected source here. */
  source: Pointer;
  /** All removed sources, in caller/selection order after normalization. */
  sources: ReadonlyArray<Pointer>;
}

export interface RemoveError {
  ok: false;
  code: "empty_selection" | "invalid_pointer" | PreFlightErrorCode;
  message: string;
  violations?: ReadonlyArray<{ path: string; message: string }>;
}

export type RemoveResult<T> = RemoveOk<T> | RemoveError;

export function remove<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  source: RemoveSource,
): RemoveResult<z.output<S>> {
  const sources = normalizeSources(source);
  if (!sources.ok) return sources;

  const patch: JSONPatchOperation[] = sortRemoveSources(sources.sources).map((path) => ({ op: "remove", path }));
  const result = preFlight(schema, state, patch);
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      violations: result.violations,
    };
  }

  return {
    ok: true,
    next: result.draft,
    patch,
    source: sources.sources[0]!,
    sources: sources.sources,
  };
}

function normalizeSources(source: RemoveSource): { ok: true; sources: Pointer[] } | RemoveError {
  const result = normalizePointerSources(source);
  return result.ok ? result : removeSourceError(result);
}

function removeSourceError(error: PointerSourceError): RemoveError {
  return error.code === "invalid_pointer"
    ? { ok: false, code: "invalid_pointer", message: `invalid remove source pointer: ${error.pointer}` }
    : { ok: false, code: "empty_selection", message: "remove source selection is empty" };
}

function sortRemoveSources(sources: ReadonlyArray<Pointer>): Pointer[] {
  return [...sources].sort(compareRemoveSource);
}

function compareRemoveSource(left: Pointer, right: Pointer): number {
  const a = tryParsePointer(left) ?? [];
  const b = tryParsePointer(right) ?? [];
  if (a.length !== b.length) return b.length - a.length;

  if (sameParent(a, b)) {
    const ai = arrayIndex(a[a.length - 1]);
    const bi = arrayIndex(b[b.length - 1]);
    if (ai !== null && bi !== null && ai !== bi) return bi - ai;
  }

  return left < right ? 1 : left > right ? -1 : 0;
}

function sameParent(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length - 1; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function arrayIndex(segment: string | undefined): number | null {
  if (segment === undefined) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  const n = Number(segment);
  return Number.isSafeInteger(n) ? n : null;
}
