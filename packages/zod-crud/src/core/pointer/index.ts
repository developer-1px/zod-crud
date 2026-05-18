// RFC 6901 — JSON Pointer.
// 정본: SPEC.md §2. 변환은 lossless.

export type Pointer = string;

export function escapeSegment(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function unescapeSegment(s: string): string {
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
  const body = "/" + segments.map((s) => escapeSegment(String(s))).join("/");
  return options.uriFragment ? "#" + encodePointerForFragment(body) : body;
}

export function parsePointer(pointer: Pointer): string[] {
  if (pointer === "" || pointer === "#") return [];
  // RFC 6901 §6 — URI fragment 형식 (`#/foo`) 자동 디코드.
  if (pointer[0] === "#") {
    if (pointer[1] !== "/") {
      throw new PointerSyntaxError(`JSON Pointer URI fragment must be '#' or start with '#/': ${JSON.stringify(pointer)}`);
    }
    try {
      return decodeURIComponent(pointer.slice(2)).split("/").map(unescapeSegment);
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
  return pointer.slice(1).split("/").map(unescapeSegment);
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
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return null;
  return Number(seg);
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
