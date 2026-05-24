const REGEX_CACHE_LIMIT = 128;
const regexCache = new Map<string, RegExp | null>();

export const objectHasOwn = Object.prototype.hasOwnProperty;

export function escapeSeg(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function plainRegexLiteral(pattern: string): string | null {
  for (let index = 0; index < pattern.length; index += 1) {
    switch (pattern[index]) {
      case "^":
      case "$":
      case "\\":
      case ".":
      case "*":
      case "+":
      case "?":
      case "(":
      case ")":
      case "[":
      case "]":
      case "{":
      case "}":
      case "|":
        return null;
    }
  }
  return pattern;
}

export function compiledRegex(pattern: string, full: boolean): RegExp | null {
  const key = `${full ? "match" : "search"}\0${pattern}`;
  if (regexCache.has(key)) return regexCache.get(key)!;

  let compiled: RegExp | null;
  try {
    const translated = translateRegexpDot(pattern);
    compiled = new RegExp(full ? `^(?:${translated})$` : translated, "u");
  } catch {
    compiled = null;
  }

  if (regexCache.size >= REGEX_CACHE_LIMIT) {
    const oldest = regexCache.keys().next().value;
    if (oldest !== undefined) regexCache.delete(oldest);
  }
  regexCache.set(key, compiled);
  return compiled;
}

function translateRegexpDot(pattern: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      out += ch;
      if (i + 1 < pattern.length) out += pattern[++i]!;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      out += ch;
      continue;
    }
    if (ch === "]" && inClass) {
      inClass = false;
      out += ch;
      continue;
    }
    out += ch === "." && !inClass ? "[^\\r\\n]" : ch;
  }
  return out;
}

export function normalizeSliceIndex(index: number | null, len: number, step: number, isStart: boolean): number {
  if (step > 0) {
    const defaultValue = isStart ? 0 : len;
    return clamp(index === null ? defaultValue : (index < 0 ? len + index : index), 0, len);
  }
  const defaultValue = isStart ? len - 1 : -1;
  return clamp(index === null ? defaultValue : (index < 0 ? len + index : index), -1, len - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
