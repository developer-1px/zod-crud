import { isPrefix, tryParsePointer, type Pointer } from "./index.js";

export type PointerSource = Pointer | ReadonlyArray<Pointer>;

export type PointerSourceError =
  | { ok: false; code: "empty_selection" }
  | { ok: false; code: "invalid_pointer"; pointer: Pointer };

export type NormalizePointerSourcesResult =
  | { ok: true; sources: Pointer[] }
  | PointerSourceError;

export function normalizePointerSources(source: PointerSource): NormalizePointerSourcesResult {
  if (typeof source === "string") {
    return tryParsePointer(source) === null
      ? { ok: false, code: "invalid_pointer", pointer: source }
      : { ok: true, sources: [source] };
  }

  const sources: Pointer[] = [];
  const parsedSources: string[][] = [];
  for (const item of source) {
    const segments = tryParsePointer(item);
    if (segments === null) {
      return { ok: false, code: "invalid_pointer", pointer: item };
    }

    if (parsedSources.some((existing) => sameSegments(existing, segments))) continue;
    if (parsedSources.some((existing) => existing.length < segments.length && isPrefix(existing, segments))) continue;

    for (let i = parsedSources.length - 1; i >= 0; i -= 1) {
      const existing = parsedSources[i]!;
      if (segments.length < existing.length && isPrefix(segments, existing)) {
        parsedSources.splice(i, 1);
        sources.splice(i, 1);
      }
    }

    sources.push(item);
    parsedSources.push(segments);
  }

  return sources.length > 0 ? { ok: true, sources } : { ok: false, code: "empty_selection" };
}

function sameSegments(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && isPrefix(left, right);
}
