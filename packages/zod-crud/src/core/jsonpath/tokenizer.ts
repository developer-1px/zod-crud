// core/jsonpath/tokenizer — RFC 9535 §2 JSONPath tokenizer.
// 출력: Token[]. parser 가 소비한다.

export type TokenKind =
  | "$" | "@"
  | "." | ".." | "*"
  | "[" | "]" | ","
  | ":"
  | "name"            // 식별자 (a-zA-Z_$ 시작 + 알파벳/숫자/_/-)
  | "string"          // 'foo' 또는 "foo"
  | "number"          // 정수 (slice / index)
  | "?" | "(" | ")"
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "&&" | "||" | "!"
  | "true" | "false" | "null"
  | "EOF";

export interface Token {
  kind: TokenKind;
  value?: string | number;
  pos: number;
}

export class JSONPathSyntaxError extends Error {
  constructor(msg: string, public pos: number) {
    super(`JSONPath syntax error at ${pos}: ${msg}`);
  }
}

const NAME_START = /[A-Za-z_$]/;
const NAME_CONT = /[A-Za-z0-9_\-$]/;

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
        if (src[i] === "\\" && i + 1 < src.length) { s += src[i + 1]; i += 2; continue; }
        s += src[i]; i++;
      }
      if (src[i] !== q) throw new JSONPathSyntaxError("unterminated string", start);
      i++;
      out.push({ kind: "string", value: s, pos: start });
      continue;
    }
    if (c === "-" || (c >= "0" && c <= "9")) {
      let j = i;
      if (src[j] === "-") j++;
      while (j < src.length && src[j]! >= "0" && src[j]! <= "9") j++;
      const num = Number(src.slice(i, j));
      out.push({ kind: "number", value: num, pos: start });
      i = j;
      continue;
    }
    if (NAME_START.test(c)) {
      let j = i + 1;
      while (j < src.length && NAME_CONT.test(src[j]!)) j++;
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
