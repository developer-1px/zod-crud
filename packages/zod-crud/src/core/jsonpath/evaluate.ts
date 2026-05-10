// core/jsonpath/evaluate — Query AST + JSON 입력 → Match[] (Pointer + value).
// RFC 9535 §2 의 normalized 의미. Pointer 는 RFC 6901.

import type { Query, Segment, Selector, FilterExpr, Comparable, SingularPath, Match } from "./types.js";

/** root JSON 입력에 query 적용 → matches. 결과 순서: RFC 9535 정합 (DFS). */
export function evaluate(query: Query, root: unknown): Match[] {
  let cur: Match[] = [{ pointer: "", value: root }];
  for (const seg of query.segments) {
    const next: Match[] = [];
    for (const m of cur) {
      next.push(...applySegment(seg, m, root));
    }
    cur = next;
  }
  return cur;
}

function applySegment(seg: Segment, m: Match, root: unknown): Match[] {
  if (seg.kind === "child") {
    const out: Match[] = [];
    for (const sel of seg.selectors) out.push(...applySelector(sel, m, root));
    return out;
  }
  // descendant — 자기 + 모든 자손에 selector 적용
  const out: Match[] = [];
  visitDescendants(m, (n) => {
    for (const sel of seg.selectors) out.push(...applySelector(sel, n, root));
  });
  return out;
}

function visitDescendants(m: Match, cb: (n: Match) => void): void {
  cb(m);
  if (m.value === null || typeof m.value !== "object") return;
  if (Array.isArray(m.value)) {
    for (let i = 0; i < m.value.length; i++) {
      visitDescendants({ pointer: m.pointer + "/" + i, value: m.value[i] }, cb);
    }
  } else {
    for (const k of Object.keys(m.value as Record<string, unknown>)) {
      visitDescendants({ pointer: m.pointer + "/" + escapeSeg(k), value: (m.value as Record<string, unknown>)[k] }, cb);
    }
  }
}

function escapeSeg(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

function applySelector(sel: Selector, m: Match, root: unknown): Match[] {
  if (sel.kind === "name") {
    if (m.value === null || typeof m.value !== "object" || Array.isArray(m.value)) return [];
    const obj = m.value as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(obj, sel.name)) return [];
    return [{ pointer: m.pointer + "/" + escapeSeg(sel.name), value: obj[sel.name] }];
  }
  if (sel.kind === "index") {
    if (!Array.isArray(m.value)) return [];
    let idx = sel.index;
    if (idx < 0) idx = m.value.length + idx;
    if (idx < 0 || idx >= m.value.length) return [];
    return [{ pointer: m.pointer + "/" + idx, value: m.value[idx] }];
  }
  if (sel.kind === "slice") {
    if (!Array.isArray(m.value)) return [];
    const len = m.value.length;
    const step = sel.step;
    if (step === 0) return [];
    let start = sel.start ?? (step > 0 ? 0 : len - 1);
    let end = sel.end ?? (step > 0 ? len : -len - 1);
    if (start < 0) start = Math.max(0, len + start);
    if (end < 0) end = Math.max(-1, len + end);
    start = Math.min(start, len);
    end = Math.min(end, len);
    const out: Match[] = [];
    if (step > 0) for (let i = start; i < end; i += step) out.push({ pointer: m.pointer + "/" + i, value: m.value[i] });
    else for (let i = start; i > end; i += step) out.push({ pointer: m.pointer + "/" + i, value: m.value[i] });
    return out;
  }
  if (sel.kind === "wildcard") {
    if (m.value === null || typeof m.value !== "object") return [];
    if (Array.isArray(m.value)) {
      return m.value.map((v, i) => ({ pointer: m.pointer + "/" + i, value: v }));
    }
    const obj = m.value as Record<string, unknown>;
    return Object.keys(obj).map((k) => ({ pointer: m.pointer + "/" + escapeSeg(k), value: obj[k] }));
  }
  if (sel.kind === "filter") {
    // filter — 자식들에 대해 expr 평가, true 인 것만
    if (m.value === null || typeof m.value !== "object") return [];
    const out: Match[] = [];
    if (Array.isArray(m.value)) {
      for (let i = 0; i < m.value.length; i++) {
        const cm = { pointer: m.pointer + "/" + i, value: m.value[i] };
        if (evalFilter(sel.expr, cm, root)) out.push(cm);
      }
    } else {
      const obj = m.value as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        const cm = { pointer: m.pointer + "/" + escapeSeg(k), value: obj[k] };
        if (evalFilter(sel.expr, cm, root)) out.push(cm);
      }
    }
    return out;
  }
  return [];
}

function evalFilter(expr: FilterExpr, current: Match, root: unknown): boolean {
  if (expr.kind === "exists") {
    return resolveSingularPath(expr.path, current, root).found;
  }
  if (expr.kind === "compare") {
    const l = resolveComparable(expr.left, current, root);
    const r = resolveComparable(expr.right, current, root);
    if (l === undefined || r === undefined) return false;
    switch (expr.op) {
      case "==": return l === r;
      case "!=": return l !== r;
      case "<": return (l as number) < (r as number);
      case "<=": return (l as number) <= (r as number);
      case ">": return (l as number) > (r as number);
      case ">=": return (l as number) >= (r as number);
    }
  }
  if (expr.kind === "and") return expr.children.every((c) => evalFilter(c, current, root));
  if (expr.kind === "or") return expr.children.some((c) => evalFilter(c, current, root));
  if (expr.kind === "not") return !evalFilter(expr.child, current, root);
  return false;
}

function resolveComparable(c: Comparable, current: Match, root: unknown): unknown {
  if (c.kind === "literal") return c.value;
  const r = resolveSingularPath(c.path, current, root);
  return r.found ? r.value : undefined;
}

function resolveSingularPath(p: SingularPath, current: Match, root: unknown): { found: boolean; value?: unknown } {
  let cur: unknown = p.root === "@" ? current.value : root;
  for (const seg of p.segments) {
    if (cur === null || typeof cur !== "object") return { found: false };
    if (seg.kind === "name") {
      if (Array.isArray(cur)) return { found: false };
      const obj = cur as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, seg.name)) return { found: false };
      cur = obj[seg.name];
    } else {
      if (!Array.isArray(cur)) return { found: false };
      const idx = seg.index < 0 ? cur.length + seg.index : seg.index;
      if (idx < 0 || idx >= cur.length) return { found: false };
      cur = cur[idx];
    }
  }
  return { found: true, value: cur };
}

/** 외부 helper — Match[] → Pointer[] (verbs/find 가 사용). */
export function matchPointers(matches: Match[]): string[] {
  return matches.map((m) => m.pointer);
}

