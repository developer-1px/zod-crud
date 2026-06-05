import { appendSegment, type JSONDocument, type JSONPatchOperation, type Pointer } from "zod-crud";
import type { SparseRecordAction, SparseRecordDecision, SparseRecordEdit, SparseRecordEqualityContext, SparseRecordError, SparseRecordErrorCode, SparseRecordIntent, SparseRecordOptions, SparseRecordResult } from "./types.js";

export function canEditSparseRecords<TDocument>(
  doc: JSONDocument<TDocument>,
  edits: SparseRecordEdit | ReadonlyArray<SparseRecordEdit>,
  options: SparseRecordOptions = {},
): SparseRecordResult {
  const normalized = Array.isArray(edits) ? edits : [edits];
  if (normalized.length === 0) {
    return error("empty_edits", "sparse-record requires at least one edit.");
  }

  const decisions: SparseRecordDecision[] = [];
  const operations: JSONPatchOperation[] = [];
  const seen = new Map<string, SparseRecordIntent>();

  for (const edit of normalized) {
    const read = doc.at(edit.root);
    if (!read.ok) {
      return error(read.code, read.reason ?? `sparse-record root not found: ${edit.root}`, read.pointer);
    }
    if (!isPlainRecord(read.value)) {
      return error("not_record", `sparse-record root is not an object record: ${read.path}`, read.path);
    }

    const record = read.value;
    const setEntries = edit.set ?? {};
    const removeEntries = edit.remove ?? [];
    if (Object.keys(setEntries).length === 0 && removeEntries.length === 0) continue;

    for (const key of Object.keys(setEntries)) {
      const conflict = markSeen(seen, edit.root, key, "set");
      if (!conflict.ok) return conflict;
      const value = setEntries[key];
      const pointer = appendSegment(edit.root, key);
      const hasCurrent = Object.prototype.hasOwnProperty.call(record, key);
      if (!hasCurrent) {
        decisions.push(decision(edit.root, key, pointer, "set", "add", undefined, value));
        operations.push({ op: "add", path: pointer, value: cloneJson(value) });
        continue;
      }

      const current = record[key];
      if (equals(current, value, { root: edit.root, key, pointer }, options)) {
        decisions.push(decision(edit.root, key, pointer, "set", "noop", current, value));
        continue;
      }

      decisions.push(decision(edit.root, key, pointer, "set", "replace", current, value));
      operations.push({ op: "replace", path: pointer, value: cloneJson(value) });
    }

    for (const key of removeEntries) {
      const conflict = markSeen(seen, edit.root, key, "remove");
      if (!conflict.ok) return conflict;
      const pointer = appendSegment(edit.root, key);
      const hasCurrent = Object.prototype.hasOwnProperty.call(record, key);
      if (!hasCurrent) {
        decisions.push(decision(edit.root, key, pointer, "remove", "noop"));
        continue;
      }

      decisions.push(decision(edit.root, key, pointer, "remove", "remove", record[key]));
      operations.push({ op: "remove", path: pointer });
    }
  }

  if (decisions.length === 0) {
    return error("empty_edits", "sparse-record requires at least one set or remove entry.");
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? "sparse-record patch rejected",
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  const added = decisions.filter((item) => item.action === "add").length;
  const replaced = decisions.filter((item) => item.action === "replace").length;
  const removed = decisions.filter((item) => item.action === "remove").length;
  const unchanged = decisions.filter((item) => item.action === "noop").length;

  return {
    ok: true,
    changed: operations.length > 0,
    count: decisions.length,
    added,
    replaced,
    removed,
    unchanged,
    decisions: cloneJson(decisions),
    operations: cloneJson(operations),
  };
}

function markSeen(
  seen: Map<string, SparseRecordIntent>,
  root: Pointer,
  key: string,
  intent: SparseRecordIntent,
): { ok: true } | SparseRecordError {
  const id = `${root}\u0000${key}`;
  const existing = seen.get(id);
  if (existing !== undefined) {
    return error("conflicting_entry", `sparse-record entry is declared more than once: ${appendSegment(root, key)}`, appendSegment(root, key));
  }
  seen.set(id, intent);
  return { ok: true };
}

export function equals(
  current: unknown,
  next: unknown,
  context: SparseRecordEqualityContext,
  options: SparseRecordOptions,
): boolean {
  return options.equals?.(current, next, context) ?? jsonEqual(current, next);
}

function decision(
  root: Pointer,
  key: string,
  pointer: Pointer,
  intent: SparseRecordIntent,
  action: SparseRecordAction,
  current?: unknown,
  value?: unknown,
): SparseRecordDecision {
  return { root, key, pointer, intent, action, ...(current === undefined ? {} : { current: cloneJson(current) }), ...(value === undefined ? {} : { value: cloneJson(value) }) };
}

function error(code: SparseRecordErrorCode, reason: string, pointer?: Pointer): SparseRecordError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index]!;
      if (key !== rightKeys[index]) return false;
      if (!jsonEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
