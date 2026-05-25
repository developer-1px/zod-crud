import type { JSONPatchOperation } from "./types.js";
import { tryParsePointer, type Pointer } from "../json-pointer/pointerCore.js";
import {
  normalizePointerSources,
  type PointerSource,
  type PointerSourceError,
} from "../json-pointer/pointerSource.js";

export interface RemoveSourcesPatchOk {
  ok: true;
  patch: JSONPatchOperation[];
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

export type RemoveSourcesPatchResult = RemoveSourcesPatchOk | PointerSourceError;

export function removeSourcesPatch(source: PointerSource): RemoveSourcesPatchResult {
  const result = normalizePointerSources(source);
  if (!result.ok) return result;
  return {
    ok: true,
    patch: sortRemoveSources(result.sources).map((path) => ({ op: "remove", path })),
    source: result.sources[0]!,
    sources: result.sources,
  };
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
  for (let i = 0; i < left.length - 1; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function arrayIndex(segment: string | undefined): number | null {
  if (segment === undefined) return null;
  if (segment.length === 0) return null;
  const first = segment.charCodeAt(0);
  if (first === 48) {
    if (segment.length !== 1) return null;
  } else {
    if (first < 49 || first > 57) return null;
    for (let index = 1; index < segment.length; index += 1) {
      const code = segment.charCodeAt(index);
      if (code < 48 || code > 57) return null;
    }
  }
  const n = Number(segment);
  return Number.isSafeInteger(n) ? n : null;
}
