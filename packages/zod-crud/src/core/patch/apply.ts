// applyOpRaw — RFC 6902 6 op 의 raw 적용 (schema 검증 없음). public 노출은 patch.ts.

import { isPrefix, type Pointer } from "../pointer/index.js";
import { jsonSerializableError } from "../json.js";
import type { ErrorCode, JSONPatchOperation } from "./index.js";
import {
  attachPointer,
  deepClone,
  deepEqual,
  getValueAt,
  mutateContainer,
  parseSafe,
  withMutated,
} from "./internal.js";

export type RawResult = { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer };

const VALID_OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);

function validateShape(op: JSONPatchOperation): { error: ErrorCode; reason: string } | null {
  if (!op || typeof op !== "object") return { error: "invalid_pointer", reason: "op must be object" };
  const opName = (op as { op: string }).op;
  if (!VALID_OPS.has(opName)) return { error: "invalid_pointer", reason: `unrecognized op: ${opName}` };
  if (typeof op.path !== "string") return { error: "invalid_pointer", reason: "missing 'path'" };
  if ((opName === "add" || opName === "replace" || opName === "test") && !("value" in op)) {
    return { error: "invalid_pointer", reason: `missing 'value' for op '${opName}'` };
  }
  if ((opName === "move" || opName === "copy") && typeof (op as { from?: unknown }).from !== "string") {
    return { error: "invalid_pointer", reason: `missing 'from' for op '${opName}'` };
  }
  return null;
}

function validateSerializableOpValue(op: JSONPatchOperation): { error: ErrorCode; reason: string } | null {
  if (op.op !== "add" && op.op !== "replace" && op.op !== "test") return null;
  const reason = jsonSerializableError(op.value);
  return reason === null ? null : { error: "not_serializable", reason };
}

export function applyOpRaw(state: unknown, op: JSONPatchOperation): RawResult {
  const shape = validateShape(op);
  if (shape) return shape;
  const serializable = validateSerializableOpValue(op);
  if (serializable) return serializable;

  const parsed = parseSafe(op.path);
  if ("error" in parsed) return parsed;
  const segments = parsed.segs;

  switch (op.op) {
    case "add": {
      if (segments.length === 0) return { state: op.value };
      const r = withMutated(state, segments, (p, k) => mutateContainer(p, k, "set", op.value));
      return "error" in r ? attachPointer(r, op.path) : r;
    }
    case "replace": {
      if (segments.length === 0) return { state: op.value };
      const r = withMutated(state, segments, (p, k) => mutateContainer(p, k, "replace", op.value));
      return "error" in r ? attachPointer(r, op.path) : r;
    }
    case "remove": {
      if (segments.length === 0) return { error: "path_not_found", reason: "cannot remove root", pointer: op.path };
      const r = withMutated(state, segments, (p, k) => mutateContainer(p, k, "remove"));
      return "error" in r ? attachPointer(r, op.path) : r;
    }
    case "test": {
      const got = getValueAt(state, segments);
      if (!got.ok) return attachPointer(got, op.path);
      if (!deepEqual(got.value, op.value)) return { error: "test_failed", reason: "value mismatch", pointer: op.path };
      return { state };
    }
    case "copy":
    case "move": {
      const fromParsed = parseSafe(op.from);
      if ("error" in fromParsed) return fromParsed;
      const fromSeg = fromParsed.segs;
      if (op.op === "move" && isPrefix(fromSeg, segments)) {
        if (fromSeg.length === segments.length) return { state }; // no-op
        return { error: "move_into_self", reason: "cannot move into own descendant", pointer: op.path };
      }
      const got = getValueAt(state, fromSeg);
      if (!got.ok) return attachPointer(got, op.from);
      if (op.op === "copy") {
        return applyOpRaw(state, { op: "add", path: op.path, value: deepClone(got.value) });
      }
      const removed = applyOpRaw(state, { op: "remove", path: op.from });
      if ("error" in removed) return removed;
      return applyOpRaw(removed.state, { op: "add", path: op.path, value: got.value });
    }
  }
}
