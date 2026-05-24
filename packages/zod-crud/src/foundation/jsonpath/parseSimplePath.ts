import type { Query, Segment, Selector } from "./types.js";

export function parseSimplePath(src: string): Query | null {
  if (src.length === 0 || src.charCodeAt(0) !== 0x24) return null;

  const segments: Segment[] = [];
  let index = 1;
  while (index < src.length) {
    const code = src.charCodeAt(index);
    if (code === 0x2e) {
      index += 1;
      if (index >= src.length) return null;

      if (src.charCodeAt(index) === 0x2a) {
        segments.push({ kind: "child", selectors: [{ kind: "wildcard" }] });
        index += 1;
        continue;
      }

      const start = index;
      if (!isAsciiNameStart(src.charCodeAt(index))) return null;
      index += 1;
      while (index < src.length && isAsciiNameChar(src.charCodeAt(index))) index += 1;
      segments.push({ kind: "child", selectors: [{ kind: "name", name: src.slice(start, index) }] });
      continue;
    }

    if (code === 0x5b) {
      const selector = parseSimpleBracketSelector(src, index + 1);
      if (selector === null) return null;
      segments.push({ kind: "child", selectors: [selector.selector] });
      index = selector.next;
      continue;
    }

    return null;
  }

  return { segments };
}

function parseSimpleBracketSelector(
  src: string,
  index: number,
): { selector: Selector; next: number } | null {
  if (src.charCodeAt(index) === 0x2a && src.charCodeAt(index + 1) === 0x5d) {
    return { selector: { kind: "wildcard" }, next: index + 2 };
  }

  const start = index;
  if (src.charCodeAt(index) === 0x2d) index += 1;
  const digitStart = index;
  while (index < src.length && isDigit(src.charCodeAt(index))) index += 1;
  if (index === digitStart || src.charCodeAt(index) !== 0x5d) return null;

  const raw = src.slice(start, index);
  if (
    raw === "-0"
    || (raw[0] === "0" && raw.length > 1)
    || (raw[0] === "-" && raw[1] === "0" && raw.length > 2)
  ) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return { selector: { kind: "index", index: value }, next: index + 1 };
}

function isAsciiNameStart(code: number): boolean {
  return code === 0x5f
    || (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a);
}

function isAsciiNameChar(code: number): boolean {
  return isDigit(code) || isAsciiNameStart(code);
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}
