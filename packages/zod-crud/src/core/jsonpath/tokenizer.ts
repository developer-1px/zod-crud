// core/jsonpath/tokenizer — RFC 9535 §2 JSONPath tokenizer.
// 출력: Token[]. parser 가 소비한다.

export type TokenKind =
  | "$" | "@"
  | "." | ".." | "*"
  | "[" | "]" | ","
  | ":"
  | "name"            // member-name-shorthand
  | "string"          // 'foo' 또는 "foo"
  | "number"          // JSON number literal
  | "?" | "(" | ")"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "&&" | "||" | "!"
  | "true" | "false" | "null"
  | "EOF";

export interface Token {
  kind: TokenKind;
  value?: string | number;
  raw?: string;
  pos: number;
}

export class JSONPathSyntaxError extends Error {
  constructor(msg: string, public pos: number) {
    super(`JSONPath syntax error at ${pos}: ${msg}`);
  }
}

function isNameStart(src: string, index: number): number {
  const cp = src.codePointAt(index);
  if (cp === undefined) return 0;
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || cp === 0x5f) return cp > 0xffff ? 2 : 1;
  if ((cp >= 0x80 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0x10ffff)) return cp > 0xffff ? 2 : 1;
  return 0;
}

function isNameChar(src: string, index: number): number {
  const cp = src.codePointAt(index);
  if (cp === undefined) return 0;
  if (cp >= 0x30 && cp <= 0x39) return 1;
  return isNameStart(src, index);
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    const start = i;
    if (c === "$") { out.push({ kind: "$", pos: start }); i++; continue; }
    if (c === "@") { out.push({ kind: "@", pos: start }); i++; continue; }
    if (c === ".") {
      if (src[i + 1] === ".") { out.push({ kind: "..", pos: start }); i += 2; continue; }
      out.push({ kind: ".", pos: start }); i++; continue;
    }
    if (c === "*") { out.push({ kind: "*", pos: start }); i++; continue; }
    if (c === "[") { out.push({ kind: "[", pos: start }); i++; continue; }
    if (c === "]") { out.push({ kind: "]", pos: start }); i++; continue; }
    if (c === ",") { out.push({ kind: ",", pos: start }); i++; continue; }
    if (c === ":") { out.push({ kind: ":", pos: start }); i++; continue; }
    if (c === "?") { out.push({ kind: "?", pos: start }); i++; continue; }
    if (c === "(") { out.push({ kind: "(", pos: start }); i++; continue; }
    if (c === ")") { out.push({ kind: ")", pos: start }); i++; continue; }
    if (c === "=" && src[i + 1] === "=") { out.push({ kind: "==", pos: start }); i += 2; continue; }
    if (c === "!" && src[i + 1] === "=") { out.push({ kind: "!=", pos: start }); i += 2; continue; }
    if (c === "<" && src[i + 1] === "=") { out.push({ kind: "<=", pos: start }); i += 2; continue; }
    if (c === ">" && src[i + 1] === "=") { out.push({ kind: ">=", pos: start }); i += 2; continue; }
    if (c === "<") { out.push({ kind: "<", pos: start }); i++; continue; }
    if (c === ">") { out.push({ kind: ">", pos: start }); i++; continue; }
    if (c === "&" && src[i + 1] === "&") { out.push({ kind: "&&", pos: start }); i += 2; continue; }
    if (c === "|" && src[i + 1] === "|") { out.push({ kind: "||", pos: start }); i += 2; continue; }
    if (c === "!") { out.push({ kind: "!", pos: start }); i++; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      let s = "";
      while (i < src.length && src[i] !== q) {
        const ch = src[i]!;
        const cp = src.codePointAt(i)!;
        if (ch === "\\") {
          const escaped = readEscapedStringChar(src, i, q, start);
          s += escaped.value;
          i = escaped.next;
          continue;
        }
        if (cp < 0x20) throw new JSONPathSyntaxError("unescaped control character in string", i);
        if (cp >= 0xd800 && cp <= 0xdfff) throw new JSONPathSyntaxError("unpaired surrogate in string", i);
        s += String.fromCodePoint(cp);
        i += cp > 0xffff ? 2 : 1;
      }
      if (src[i] !== q) throw new JSONPathSyntaxError("unterminated string", start);
      i++;
      out.push({ kind: "string", value: s, pos: start });
      continue;
    }
    if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i;
      if (src[j] === "-") j++;
      if (j >= src.length || src[j]! < "0" || src[j]! > "9") {
        throw new JSONPathSyntaxError("invalid number", start);
      }
      if (src[j] === "0" && src[j + 1] !== undefined && src[j + 1]! >= "0" && src[j + 1]! <= "9") {
        throw new JSONPathSyntaxError("invalid number", start);
      }
      while (j < src.length && src[j]! >= "0" && src[j]! <= "9") j++;
      if (src[j] === ".") {
        j++;
        if (j >= src.length || src[j]! < "0" || src[j]! > "9") {
          throw new JSONPathSyntaxError("invalid number", start);
        }
        while (j < src.length && src[j]! >= "0" && src[j]! <= "9") j++;
      }
      if (src[j] === "e" || src[j] === "E") {
        j++;
        if (src[j] === "+" || src[j] === "-") j++;
        if (j >= src.length || src[j]! < "0" || src[j]! > "9") {
          throw new JSONPathSyntaxError("invalid number", start);
        }
        while (j < src.length && src[j]! >= "0" && src[j]! <= "9") j++;
      }
      const raw = src.slice(i, j);
      const num = Number(raw);
      out.push({ kind: "number", value: num, raw, pos: start });
      i = j;
      continue;
    }
    const nameStartSize = isNameStart(src, i);
    if (nameStartSize > 0) {
      let j = i + nameStartSize;
      while (j < src.length) {
        const size = isNameChar(src, j);
        if (size === 0) break;
        j += size;
      }
      const name = src.slice(i, j);
      if (name === "true" || name === "false" || name === "null") {
        out.push({ kind: name as TokenKind, pos: start });
      } else {
        out.push({ kind: "name", value: name, pos: start });
      }
      i = j;
      continue;
    }
    throw new JSONPathSyntaxError(`unexpected char '${c}'`, start);
  }
  out.push({ kind: "EOF", pos: i });
  return out;
}

function readEscapedStringChar(src: string, index: number, quote: "'" | '"', stringStart: number): { value: string; next: number } {
  const escaped = src[index + 1];
  if (escaped === undefined) throw new JSONPathSyntaxError("unterminated escape", stringStart);
  switch (escaped) {
    case '"':
      if (quote !== '"') throw new JSONPathSyntaxError("invalid escape", index);
      return { value: '"', next: index + 2 };
    case "'":
      if (quote !== "'") throw new JSONPathSyntaxError("invalid escape", index);
      return { value: "'", next: index + 2 };
    case "/": return { value: "/", next: index + 2 };
    case "\\": return { value: "\\", next: index + 2 };
    case "b": return { value: "\b", next: index + 2 };
    case "f": return { value: "\f", next: index + 2 };
    case "n": return { value: "\n", next: index + 2 };
    case "r": return { value: "\r", next: index + 2 };
    case "t": return { value: "\t", next: index + 2 };
    case "u":
      return readUnicodeEscape(src, index);
    default:
      throw new JSONPathSyntaxError("invalid escape", index);
  }
}

function readUnicodeEscape(src: string, index: number): { value: string; next: number } {
  const first = readHexQuad(src, index + 2, index);
  if (first.code >= 0xd800 && first.code <= 0xdbff) {
    if (src[index + 6] !== "\\" || src[index + 7] !== "u") {
      throw new JSONPathSyntaxError("missing low surrogate", index);
    }
    const second = readHexQuad(src, index + 8, index + 6);
    if (second.code < 0xdc00 || second.code > 0xdfff) {
      throw new JSONPathSyntaxError("invalid low surrogate", index + 6);
    }
    const high = first.code - 0xd800;
    const low = second.code - 0xdc00;
    return { value: String.fromCodePoint(0x10000 + ((high << 10) | low)), next: index + 12 };
  }
  if (first.code >= 0xdc00 && first.code <= 0xdfff) {
    throw new JSONPathSyntaxError("unpaired low surrogate", index);
  }
  return { value: String.fromCharCode(first.code), next: index + 6 };
}

function readHexQuad(src: string, index: number, escapeIndex: number): { code: number } {
  const raw = src.slice(index, index + 4);
  if (!/^[0-9A-Fa-f]{4}$/.test(raw)) {
    throw new JSONPathSyntaxError("invalid unicode escape", escapeIndex);
  }
  return { code: Number.parseInt(raw, 16) };
}
