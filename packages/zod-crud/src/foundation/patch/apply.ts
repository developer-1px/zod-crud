// applyOpRaw — RFC 6902 6 op 의 raw 적용 (schema 검증 없음). public 노출은 patch.ts.

import { isPrefix, type Pointer } from "../pointer/index.js";
import { cloneJson } from "../json/clone.js";
import { jsonSerializableError } from "../json/serializable.js";
import type { ErrorCode, JSONPatchOperation } from "./contract.js";
import {
  attachPointer,
  deepEqual,
  getValueAt,
  mutateContainer,
  parseSafe,
  withMutated,
} from "./container.js";

export type RawResult = { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer };

export function validateOperationShape(op: JSONPatchOperation): { error: ErrorCode; reason: string } | null {
  if (!op || typeof op !== "object") return { error: "invalid_pointer", reason: "op must be object" };
  const opName = (op as { op: string }).op;
  switch (opName) {
    case "add":
    case "replace":
    case "test":
      if (typeof op.path !== "string") return { error: "invalid_pointer", reason: "missing 'path'" };
      if (!("value" in op)) {
        return { error: "invalid_pointer", reason: `missing 'value' for op '${opName}'` };
      }
      return null;
    case "remove":
      if (typeof op.path !== "string") return { error: "invalid_pointer", reason: "missing 'path'" };
      return null;
    case "move":
    case "copy":
      if (typeof op.path !== "string") return { error: "invalid_pointer", reason: "missing 'path'" };
      if (typeof (op as { from?: unknown }).from !== "string") {
        return { error: "invalid_pointer", reason: `missing 'from' for op '${opName}'` };
      }
      return null;
    default:
      return { error: "invalid_pointer", reason: `unrecognized op: ${opName}` };
  }
}

function validateSerializableOpValue(op: JSONPatchOperation): { error: ErrorCode; reason: string } | null {
  if (op.op !== "add" && op.op !== "replace" && op.op !== "test") return null;
  const reason = jsonSerializableError(op.value);
  return reason === null ? null : { error: "not_serializable", reason };
}

export function applyOpRaw(state: unknown, op: JSONPatchOperation): RawResult {
  const shape = validateOperationShape(op);
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
        return applyOpRaw(state, { op: "add", path: op.path, value: cloneJson(got.value) });
      }
      const removed = applyOpRaw(state, { op: "remove", path: op.from });
      if ("error" in removed) return removed;
      return applyOpRaw(removed.state, { op: "add", path: op.path, value: got.value });
    }
  }
}
