// RFC 6901 — JSON Pointer.
// 정본: SPEC.md §2. 변환은 lossless.

export type Pointer = string;

export function escapeSegment(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function unescapeSegment(s: string): string {
  return s.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function buildPointer(segments: ReadonlyArray<string | number>): Pointer {
  if (segments.length === 0) return "";
  return "/" + segments.map((s) => escapeSegment(String(s))).join("/");
}

export function parsePointer(pointer: Pointer): string[] {
  if (pointer === "") return [];
  if (pointer[0] !== "/") {
    throw new PointerSyntaxError(`JSON Pointer must be empty or start with '/': ${JSON.stringify(pointer)}`);
  }
  return pointer.slice(1).split("/").map(unescapeSegment);
}

export class PointerSyntaxError extends Error {
  override readonly name = "PointerSyntaxError";
}
