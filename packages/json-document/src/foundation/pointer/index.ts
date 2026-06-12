// RFC 6901 — JSON Pointer.
// 정본: docs/standard/json-document-spec.md §2. 변환은 lossless.

export type Pointer = string;

export function escapeSegment(s: string): string {
  if (!s.includes("~") && !s.includes("/")) return s;
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function unescapeSegment(s: string): string {
  if (!s.includes("~")) return s;
  return s.replace(/~1/g, "/").replace(/~0/g, "~");
}

export interface BuildPointerOptions {
  /** RFC 6901 §6 — URI fragment 표현 (`#` prefix + percent-encoding). default false. */
  uriFragment?: boolean;
}

export function buildPointer(
  segments: ReadonlyArray<string | number>,
  options: BuildPointerOptions = {},
): Pointer {
  if (segments.length === 0) return options.uriFragment ? "#" : "";
  let body = "";
  for (let index = 0; index < segments.length; index += 1) {
    body += "/" + escapeSegment(String(segments[index]));
  }
  return options.uriFragment ? "#" + encodePointerForFragment(body) : body;
}

function parsePointerSegments(body: string): string[] {
  return body.includes("~")
    ? body.split("/").map(unescapeSegment)
    : body.split("/");
}

export function parsePointer(pointer: Pointer): string[] {
  if (pointer === "" || pointer === "#") return [];
  // RFC 6901 §6 — URI fragment 형식 (`#/foo`) 자동 디코드.
  if (pointer[0] === "#") {
    if (pointer[1] !== "/") {
      throw new PointerSyntaxError(`JSON Pointer URI fragment must be '#' or start with '#/': ${JSON.stringify(pointer)}`);
    }
    try {
      return parsePointerSegments(decodeURIComponent(pointer.slice(2)));
    } catch (error) {
      throw new PointerSyntaxError(
        error instanceof Error
          ? `Invalid JSON Pointer URI fragment encoding: ${error.message}`
          : "Invalid JSON Pointer URI fragment encoding",
      );
    }
  }
  if (pointer[0] !== "/") {
    throw new PointerSyntaxError(`JSON Pointer must be empty or start with '/': ${JSON.stringify(pointer)}`);
  }
  return parsePointerSegments(pointer.slice(1));
}

export function tryParsePointer(pointer: Pointer): string[] | null {
  if (pointer === "" || pointer === "#") return [];
  if (pointer[0] === "#") {
    if (pointer[1] !== "/") return null;
    try {
      return parsePointerSegments(decodeURIComponent(pointer.slice(2)));
    } catch {
      return null;
    }
  }
  if (pointer[0] !== "/") return null;
  return parsePointerSegments(pointer.slice(1));
}

// RFC 3986 + 6901 §6: fragment 안에서 안전하지 않은 문자 percent-encode.
// JSON Pointer 자체의 escape (~0, ~1) 는 이미 처리됐으므로 fragment 의 추가 제약만.
function encodePointerForFragment(s: string): string {
  // %, " ", '"', '<', '>', '\\', '^', '`', '{', '|', '}' 등을 인코딩.
  return s.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@/?]/g, (c) =>
    "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
}

export class PointerSyntaxError extends Error {
  override readonly name = "PointerSyntaxError";
}

// ── Path arithmetic (state-free, schema-free) ───────────────────────────────
// SPEC §5.6. RFC 6901 위에서 순수 path 조작. state·schema 모름. 모든 editor 가 공유.

/** Parent pointer. `""` (root) 는 `null`. `"/a"` → `""`, `"/a/b"` → `"/a"`. */
export function parentPointer(pointer: Pointer): Pointer | null {
  if (pointer === "") return null;
  const i = pointer.lastIndexOf("/");
  return i <= 0 ? "" : pointer.slice(0, i);
}

/** 마지막 segment (이스케이프 디코드된). `""` 또는 `null`. */
export function lastSegment(pointer: Pointer): string | null {
  if (pointer === "") return null;
  const i = pointer.lastIndexOf("/");
  if (i < 0) return null;
  return unescapeSegment(pointer.slice(i + 1));
}

/** 마지막 segment 가 array index 면 그 정수, 아니면 `null` (record key 또는 root). */
export function lastSegmentIndex(pointer: Pointer): number | null {
  const seg = lastSegment(pointer);
  if (seg === null) return null;
  if (!isArrayIndexSegment(seg)) return null;
  return Number(seg);
}

function isArrayIndexSegment(segment: string): boolean {
  if (segment === "") return false;
  if (segment === "0") return true;
  const first = segment.charCodeAt(0);
  if (first < 49 || first > 57) return false;
  for (let index = 1; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/** Pointer 끝에 segment 추가. `appendSegment("/a", 0)` → `"/a/0"`, escape 자동. */
export function appendSegment(pointer: Pointer, seg: string | number): Pointer {
  return pointer + "/" + escapeSegment(String(seg));
}

/** Pointer 의 마지막 segment 를 교체. root 면 `null`. */
export function withLastSegment(pointer: Pointer, seg: string | number): Pointer | null {
  if (pointer === "") return null;
  const i = pointer.lastIndexOf("/");
  if (i < 0) return null;
  return pointer.slice(0, i + 1) + escapeSegment(String(seg));
}

// ── Internal helpers (not in public index) ──────────────────────────────────

/** segs prefix check. */
export function isPrefix(prefix: ReadonlyArray<string>, full: ReadonlyArray<string>): boolean {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) if (prefix[i] !== full[i]) return false;
  return true;
}

/** state + segments → value. boolean ok. `"-"` 는 path_not_found 로 취급. */
export function readAt(state: unknown, segs: ReadonlyArray<string>): { ok: true; value: unknown } | { ok: false } {
  let cur: unknown = state;
  for (const seg of segs) {
    if (cur === null || typeof cur !== "object") return { ok: false };
    if (Array.isArray(cur)) {
      const i = seg === "-" ? -1 : Number(seg);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { ok: false };
      cur = cur[i];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return { ok: false };
      cur = (cur as Record<string, unknown>)[seg];
    }
  }
  return { ok: true, value: cur };
}
