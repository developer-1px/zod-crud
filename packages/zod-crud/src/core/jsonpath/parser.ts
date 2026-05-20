// core/jsonpath/parser — Token[] -> Query AST (RFC 9535).
// 구현 범위: name / index / slice / wildcard / descendant / filter + RFC 9535 function extensions.

import type { Query, Segment, Selector, FilterExpr, Comparable, FilterQuery, CompareOp, FunctionExpr } from "./types.js";
import { tokenize, JSONPathSyntaxError, type Token } from "./tokenizer.js";

export function parse(src: string): Query {
  if (/^\s|\s$/.test(src)) {
    throw new JSONPathSyntaxError("leading or trailing whitespace", 0);
  }
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
      const dot = this.next();
      const sel = this.parseDotSelector(dot.pos + 1);
      return { kind: "child", selectors: [sel] };
    }
    if (t.kind === "..") {
      const dots = this.next();
      // descendant + (selector | bracket selectors)
      if (this.peek().kind === "[") {
        this.next();
        const selectors = this.parseBracketSelectors();
        this.consume("]");
        return { kind: "descendant", selectors };
      }
      const sel = this.parseDotSelector(dots.pos + 2);
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

  parseDotSelector(expectedPos: number): Selector {
    const t = this.next();
    if (t.pos !== expectedPos) throw new JSONPathSyntaxError("selector must be adjacent to dot", t.pos);
    if (t.kind === "*") return { kind: "wildcard" };
    if (t.kind === "name") return { kind: "name", name: String(t.value) };
    if (t.kind === "true" || t.kind === "false" || t.kind === "null") return { kind: "name", name: t.kind };
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
      if (t.kind === "number") { start = this.readInteger(this.next()); parts = 1; }
      if (this.peek().kind === ":") {
        this.next();
        if (this.peek().kind === "number") { end = this.readInteger(this.next()); }
        if (this.peek().kind === ":") { this.next(); if (this.peek().kind === "number") step = this.readInteger(this.next()); }
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
      if ((left.kind === "path" && !isSingularQuery(left.path)) || (right.kind === "path" && !isSingularQuery(right.path))) {
        throw new JSONPathSyntaxError("comparison operands must be singular queries", t.pos);
      }
      if ((left.kind === "function" && functionReturnType(left.fn) === "logical") || (right.kind === "function" && functionReturnType(right.fn) === "logical")) {
        throw new JSONPathSyntaxError("logical function result cannot be compared", t.pos);
      }
      return { kind: "compare", op: t.kind as CompareOp, left, right };
    }
    if (left.kind === "path") return { kind: "exists", path: left.path };
    if (left.kind === "function" && functionReturnType(left.fn) === "logical") return { kind: "function", fn: left.fn };
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
      const path = this.parseFilterQuery();
      return { kind: "path", path };
    }
    if (t.kind === "name" && this.peek(1).kind === "(") {
      return { kind: "function", fn: this.parseFunction() };
    }
    throw new JSONPathSyntaxError(`expected literal or path, got ${t.kind}`, t.pos);
  }

  parseFilterQuery(): FilterQuery {
    const root = this.next().kind as "@" | "$";
    const segments: FilterQuery["segments"] = [];
    while (this.peek().kind === "." || this.peek().kind === ".." || this.peek().kind === "[") {
      segments.push(this.parseSegment());
    }
    return { root, segments };
  }

  parseFunction(): FunctionExpr {
    const nameToken = this.consume("name");
    const name = String(nameToken.value);
    const open = this.consume("(");
    if (open.pos !== nameToken.pos + name.length) throw new JSONPathSyntaxError("function call must be adjacent to name", open.pos);
    const args: Comparable[] = [];
    if (this.peek().kind !== ")") {
      args.push(this.parseComparable());
      while (this.peek().kind === ",") {
        this.next();
        args.push(this.parseComparable());
      }
    }
    this.consume(")");
    const fn = { name, args };
    validateFunction(fn, nameToken.pos);
    return fn;
  }

  readInteger(token: Token): number {
    const value = Number(token.value);
    const raw = token.raw ?? String(token.value);
    if (raw === "-0" || raw.includes(".") || raw.includes("e") || raw.includes("E")) {
      throw new JSONPathSyntaxError("expected integer", token.pos);
    }
    if (!Number.isSafeInteger(value)) throw new JSONPathSyntaxError("integer out of range", token.pos);
    return value;
  }
}

function isSingularQuery(path: FilterQuery): boolean {
  return path.segments.every((segment) =>
    segment.kind === "child"
    && segment.selectors.length === 1
    && (segment.selectors[0]?.kind === "name" || segment.selectors[0]?.kind === "index")
  );
}

function validateFunction(fn: FunctionExpr, pos: number): void {
  switch (fn.name) {
    case "length":
      if (fn.args.length !== 1) throw new JSONPathSyntaxError("length expects one argument", pos);
      if (!isValueTypeArg(fn.args[0]!)) throw new JSONPathSyntaxError("length expects a value argument", pos);
      return;
    case "count":
      if (fn.args.length !== 1) throw new JSONPathSyntaxError("count expects one argument", pos);
      if (fn.args[0]?.kind !== "path") throw new JSONPathSyntaxError("count expects a query argument", pos);
      return;
    case "match":
    case "search":
      if (fn.args.length !== 2) throw new JSONPathSyntaxError(`${fn.name} expects two arguments`, pos);
      if (!isValueTypeArg(fn.args[0]!) || !isValueTypeArg(fn.args[1]!)) {
        throw new JSONPathSyntaxError(`${fn.name} expects value arguments`, pos);
      }
      return;
    case "value":
      if (fn.args.length !== 1) throw new JSONPathSyntaxError("value expects one argument", pos);
      if (fn.args[0]?.kind !== "path") throw new JSONPathSyntaxError("value expects a query argument", pos);
      return;
    default:
      throw new JSONPathSyntaxError(`unknown function ${fn.name}`, pos);
  }
}

function isValueTypeArg(arg: Comparable): boolean {
  if (arg.kind === "literal") return true;
  if (arg.kind === "path") return isSingularQuery(arg.path);
  return functionReturnType(arg.fn) === "value";
}

function functionReturnType(fn: FunctionExpr): "logical" | "value" {
  switch (fn.name) {
    case "match":
    case "search":
      return "logical";
    case "length":
    case "count":
    case "value":
      return "value";
    default:
      throw new JSONPathSyntaxError(`unknown function ${fn.name}`, 0);
  }
}
