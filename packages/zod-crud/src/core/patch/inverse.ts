// computeInverses — undo 용 RFC 6902 inverse op 계산.

import { parsePointer, readAt, type Pointer } from "../pointer/index.js";
import type { JsonPatchOperation } from "./index.js";
import { applyOpRaw } from "./apply.js";
import { resolveAppendPath } from "./internal.js";

function inverseOp(op: JsonPatchOperation, before: unknown): JsonPatchOperation | null {
  switch (op.op) {
    case "add":
    case "copy": {
      const path = resolveAppendPath(op.path, before);
      return { op: "remove", path };
    }
    case "remove": {
      const prev = readAt(before, parsePointer(op.path));
      if (!prev.ok) return null;
      return { op: "add", path: op.path, value: prev.value };
    }
    case "replace": {
      if (op.path === "") return { op: "replace", path: "", value: before };
      const prev = readAt(before, parsePointer(op.path));
      if (!prev.ok) return null;
      return { op: "replace", path: op.path, value: prev.value };
    }
    case "move": {
      // 단순화: append marker 만 idx 로 resolve. 그 외엔 양방향 swap.
      const path = resolveAppendPath(op.path, before);
      return { op: "move", from: path, path: op.from };
    }
    case "test": return null;
  }
}

// forward 를 순서대로 적용하며 매 단계 inverse 를 계산. 반환: undo 시 그대로 applyPatch 에 넘기면 forward 가 되돌려진다.
export function computeInverses(
  state: unknown,
  ops: ReadonlyArray<JsonPatchOperation>,
): { ok: true; inverses: JsonPatchOperation[] } | { ok: false } {
  const out: JsonPatchOperation[] = [];
  let cur: unknown = state;
  for (const op of ops) {
    const inv = inverseOp(op, cur);
    const r = applyOpRaw(cur, op);
    if ("error" in r) return { ok: false };
    if (inv) out.unshift(inv);
    cur = r.state;
  }
  return { ok: true, inverses: out };
}
