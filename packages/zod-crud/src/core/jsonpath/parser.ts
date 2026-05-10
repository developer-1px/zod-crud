// core/jsonpath/parser — Token[] -> Query AST (RFC 9535).
// 1차 구현 범위: name / index / slice / wildcard / descendant / 기본 filter.

import type { Query, Segment, Selector, FilterExpr, Comparable, SingularPath, CompareOp } from "./types.js";
import { tokenize, JSONPathSyntaxError, type Token } from "./tokenizer.js";

export function parse(src: string): Query {
  const tokens = tokenize(src);
  const p = new Parser(tokens);
  p.consume("$");
  const segments: Segment[] = [];
  while (p.peek().kind !== "EOF") {
    segments.push(p.parseSegment());
  }
  return { segments };
}

class Parser {
  i = 0;
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token { return this.tokens[this.i + offset]!; }
  next(): Token { return this.tokens[this.i++]!; }
  consume(kind: string): Token {
    const t = this.next();
    if (t.kind !== kind) throw new JSONPathSyntaxError(`expected ${kind}, got ${t.kind}`, t.pos);
    return t;
  }
  match(...kinds: string[]): boolean {
    return kinds.includes(this.peek().kind);
  }

  parseSegment(): Segment {
    const t = this.peek();
    if (t.kind === ".") {
      this.next();
      const sel = this.parseDotSelector();
      return { kind: "child", selectors: [sel] };
    }
    if (t.kind === "..") {
      this.next();
      // descendant + (selector | bracket selectors)
      if (this.peek().kind === "[") {
        this.next();
        const selectors = this.parseBracketSelectors();
        this.consume("]");
        return { kind: "descendant", selectors };
      }
      const sel = this.parseDotSelector();
      return { kind: "descendant", selectors: [sel] };
    }
    if (t.kind === "[") {
      this.next();
      const selectors = this.parseBracketSelectors();
      this.consume("]");
      return { kind: "child", selectors };
    }
    throw new JSONPathSyntaxError(`unexpected ${t.kind}`, t.pos);
  }

  parseDotSelector(): Selector {
    const t = this.next();
    if (t.kind === "*") return { kind: "wildcard" };
    if (t.kind === "name") return { kind: "name", name: String(t.value) };
    throw new JSONPathSyntaxError(`expected name or *, got ${t.kind}`, t.pos);
  }

  parseBracketSelectors(): Selector[] {
    const out: Selector[] = [];
    out.push(this.parseSelector());
    while (this.peek().kind === ",") {
      this.next();
      out.push(this.parseSelector());
    }
    return out;
  }

  parseSelector(): Selector {
    const t = this.peek();
    if (t.kind === "*") { this.next(); return { kind: "wildcard" }; }
    if (t.kind === "string") { this.next(); return { kind: "name", name: String(t.value) }; }
    if (t.kind === "?") {
      this.next();
      const expr = this.parseFilter();
      return { kind: "filter", expr };
    }
    if (t.kind === "number" || t.kind === ":") {
      // index 또는 slice
      let start: number | null = null, end: number | null = null, step = 1;
      let parts = 0;
      if (t.kind === "number") { start = Number(t.value); this.next(); parts = 1; }
      if (this.peek().kind === ":") {
        this.next();
        if (this.peek().kind === "number") { end = Number(this.next().value); }
        if (this.peek().kind === ":") { this.next(); if (this.peek().kind === "number") step = Number(this.next().value); }
        return { kind: "slice", start, end, step };
      }
      if (parts === 1) return { kind: "index", index: start! };
      throw new JSONPathSyntaxError("invalid selector", t.pos);
    }
    throw new JSONPathSyntaxError(`unexpected ${t.kind}`, t.pos);
  }

  parseFilter(): FilterExpr {
    return this.parseOr();
  }

  parseOr(): FilterExpr {
    let left = this.parseAnd();
    while (this.peek().kind === "||") { this.next(); const right = this.parseAnd(); left = { kind: "or", children: [left, right] }; }
    return left;
  }

  parseAnd(): FilterExpr {
    let left = this.parseUnary();
    while (this.peek().kind === "&&") { this.next(); const right = this.parseUnary(); left = { kind: "and", children: [left, right] }; }
    return left;
  }

  parseUnary(): FilterExpr {
    if (this.peek().kind === "!") { this.next(); return { kind: "not", child: this.parseUnary() }; }
    if (this.peek().kind === "(") { this.next(); const e = this.parseOr(); this.consume(")"); return e; }
    return this.parseAtom();
  }

  parseAtom(): FilterExpr {
    // 비교 또는 exists. left 가 path 면 exists, 비교 토큰이 따라오면 compare.
    const left = this.parseComparable();
    const t = this.peek();
    if (["==", "!=", "<", "<=", ">", ">="].includes(t.kind)) {
      this.next();
      const right = this.parseComparable();
      return { kind: "compare", op: t.kind as CompareOp, left, right };
    }
    if (left.kind === "path") return { kind: "exists", path: left.path };
    throw new JSONPathSyntaxError(`literal alone is not a filter expr`, t.pos);
  }

  parseComparable(): Comparable {
    const t = this.peek();
    if (t.kind === "string") { this.next(); return { kind: "literal", value: String(t.value) }; }
    if (t.kind === "number") { this.next(); return { kind: "literal", value: Number(t.value) }; }
    if (t.kind === "true") { this.next(); return { kind: "literal", value: true }; }
    if (t.kind === "false") { this.next(); return { kind: "literal", value: false }; }
    if (t.kind === "null") { this.next(); return { kind: "literal", value: null }; }
    if (t.kind === "@" || t.kind === "$") {
      const path = this.parseSingularPath();
      return { kind: "path", path };
    }
    throw new JSONPathSyntaxError(`expected literal or path, got ${t.kind}`, t.pos);
  }

  parseSingularPath(): SingularPath {
    const root = this.next().kind as "@" | "$";
    const segments: SingularPath["segments"] = [];
    while (true) {
      if (this.peek().kind === ".") {
        this.next();
        const t = this.next();
        if (t.kind === "name") segments.push({ kind: "name", name: String(t.value) });
        else throw new JSONPathSyntaxError(`expected name after .`, t.pos);
      } else if (this.peek().kind === "[") {
        this.next();
        const t = this.next();
        if (t.kind === "string") segments.push({ kind: "name", name: String(t.value) });
        else if (t.kind === "number") segments.push({ kind: "index", index: Number(t.value) });
        else throw new JSONPathSyntaxError(`expected string or number in [...]`, t.pos);
        this.consume("]");
      } else break;
    }
    return { root, segments };
  }
}
