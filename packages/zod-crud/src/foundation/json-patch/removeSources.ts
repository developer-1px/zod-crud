import type { JSONPatchOperation } from "./index.js";
import { tryParsePointer, type Pointer } from "../json-pointer/index.js";
import {
  normalizePointerSources,
  type PointerSource,
  type PointerSourceError,
} from "../json-pointer/sourceSet.js";

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
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  const n = Number(segment);
  return Number.isSafeInteger(n) ? n : null;
}
