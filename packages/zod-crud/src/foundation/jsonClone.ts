import { buildPointer } from "./json-pointer/index.js";
import type { CloneJsonResult } from "./jsonTypes.js";
import { cloneTrustedPlainJson } from "./jsonTrustedClone.js";
import { jsonSerializableErrorFast } from "./jsonSerializable.js";

const LARGE_ARRAY_CLONE_THRESHOLD = 128;
const LARGE_ARRAY_OBJECT_HEAD_SCAN_LIMIT = 128;
const LARGE_OBJECT_ARRAY_FIELD_WITH_OBJECT_HEAD_CLONE_THRESHOLD = 512;
const LARGE_OBJECT_ARRAY_FIELD_CLONE_THRESHOLD = 4096;

export function cloneJson<T>(value: T): T {
  const result = cloneJsonSerializable(value);
  if (!result.ok) throw new TypeError(`Value is not JSON-serializable: ${result.reason}`);
  return result.value;
}

export function cloneJsonSerializable<T>(value: T): CloneJsonResult<T> {
  if (shouldValidateThenTrustedClone(value)) {
    const reason = jsonSerializableErrorFast(value);
    return reason === null
      ? { ok: true, value: cloneTrustedPlainJson(value) as T }
      : cloneJsonSerializableDetailed(value);
  }
  const fast = cloneJsonSerializableFast(value);
  return fast.ok ? fast : cloneJsonSerializableDetailed(value);
}

function shouldValidateThenTrustedClone(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length >= LARGE_ARRAY_CLONE_THRESHOLD && largeArrayHasObjectHead(value);
  }
  if (value === null || typeof value !== "object") return false;

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;

  const names = Object.getOwnPropertyNames(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, names[index]!);
    if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) {
      return false;
    }
    const child = descriptor.value;
    if (!Array.isArray(child)) continue;
    if (child.length >= LARGE_OBJECT_ARRAY_FIELD_CLONE_THRESHOLD) {
      return true;
    }
    if (child.length < LARGE_OBJECT_ARRAY_FIELD_WITH_OBJECT_HEAD_CLONE_THRESHOLD) continue;

    const head = child[0];
    if (head !== null && typeof head === "object") return true;
  }
  return false;
}

function largeArrayHasObjectHead(value: unknown[]): boolean {
  const end = Math.min(value.length, LARGE_ARRAY_OBJECT_HEAD_SCAN_LIMIT);
  for (let index = 0; index < end; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || "get" in descriptor || "set" in descriptor) {
      return false;
    }
    const child = descriptor.value;
    if (child !== null && typeof child === "object") return true;
  }
  return false;
}

function cloneJsonSerializableFast<T>(value: T): CloneJsonResult<T> {
  const seen = new WeakSet<object>();
  let error: string | null = null;
  const fail = (reason: string): undefined => {
    error = reason;
    return undefined;
  };

  const visit = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return v;
    if (t === "number") return Number.isFinite(v) ? v : fail("non-finite number");
    if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") {
      return fail(`${t} is not JSON`);
    }
    if (t !== "object") return v;

    const obj = v as object;
    if (seen.has(obj)) return fail("circular reference");
    seen.add(obj);

    if (Array.isArray(v)) {
      const names = Object.getOwnPropertyNames(v);
      if (names.length !== v.length + 1) return fail("non-index array property is not JSON");
      const next = new Array(v.length);
      for (let index = 0; index < v.length; index += 1) {
        const key = names[index];
        if (key === undefined) return fail("sparse array hole");
        if (key !== String(index)) return fail("sparse array hole");
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        if (!descriptor) return fail("sparse array hole");
        if (!descriptor.enumerable) return fail("non-enumerable property is not JSON");
        if ("get" in descriptor || "set" in descriptor) return fail("accessor property is not JSON");
        const cloned = visit(descriptor.value);
        if (error) return undefined;
        next[index] = cloned;
      }

      if (names[names.length - 1] !== "length") return fail("non-index array property is not JSON");
      return Object.getOwnPropertySymbols(v).length === 0 ? next : fail("symbol keys are not JSON");
    }

    const objectValue = v as object;
    const proto = Object.getPrototypeOf(objectValue);
    if (proto !== Object.prototype && proto !== null) return fail("non-plain object");

    const next: Record<string, unknown> = {};
    const keys = Object.getOwnPropertyNames(objectValue);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
      if (!descriptor) return fail("non-enumerable property is not JSON");
      if (!descriptor.enumerable) return fail("non-enumerable property is not JSON");
      if ("get" in descriptor || "set" in descriptor) return fail("accessor property is not JSON");
      const cloned = visit(descriptor.value);
      if (error) return undefined;
      if (key === "__proto__") {
        Object.defineProperty(next, key, {
          value: cloned,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } else {
        next[key] = cloned;
      }
    }
    return Object.getOwnPropertySymbols(v).length === 0 ? next : fail("symbol keys are not JSON");
  };

  const cloned = visit(value);
  return error === null ? { ok: true, value: cloned as T } : { ok: false, reason: error };
}

function cloneJsonSerializableDetailed<T>(value: T): CloneJsonResult<T> {
  const seen = new WeakSet<object>();
  const path: Array<string | number> = [];
  const at = (): string => buildPointer(path);
  let error: string | null = null;
  const fail = (reason: string): undefined => {
    error = reason;
    return undefined;
  };

  const visit = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return v;
    if (t === "number") {
      return Number.isFinite(v) ? v : fail(`${at()}: non-finite number`);
    }
    if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") {
      return fail(`${at()}: ${t} is not JSON`);
    }
    if (t !== "object") return v;

    const obj = v as object;
    if (seen.has(obj)) return fail(`${at()}: circular reference`);
    seen.add(obj);

    if (Array.isArray(v)) {
      if (Object.getOwnPropertySymbols(v).length > 0) {
        return fail(`${at()}: symbol keys are not JSON`);
      }

      const next = new Array(v.length);
      for (let index = 0; index < v.length; index += 1) {
        path.push(index);
        const descriptor = Object.getOwnPropertyDescriptor(v, String(index));
        if (!descriptor) {
          const reason = `${at()}: sparse array hole`;
          path.pop();
          return fail(reason);
        }
        if (!descriptor.enumerable) {
          const reason = `${at()}: non-enumerable property is not JSON`;
          path.pop();
          return fail(reason);
        }
        if ("get" in descriptor || "set" in descriptor) {
          const reason = `${at()}: accessor property is not JSON`;
          path.pop();
          return fail(reason);
        }
        const cloned = visit(descriptor.value);
        path.pop();
        if (error) return undefined;
        next[index] = cloned;
      }

      if (Object.getOwnPropertyNames(v).length !== v.length + 1) {
        for (const key of Object.getOwnPropertyNames(v)) {
          if (key === "length" || isArrayIndexKey(key)) continue;
          path.push(arrayPropertyPathSegment(key));
          const reason = `${at()}: non-index array property is not JSON`;
          path.pop();
          return fail(reason);
        }
      }
      return next;
    }

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      const name = proto?.constructor?.name ?? "unknown";
      return fail(`${at()}: non-plain object (${name})`);
    }

    if (Object.getOwnPropertySymbols(v).length > 0) {
      return fail(`${at()}: symbol keys are not JSON`);
    }

    const next: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor) continue;
      path.push(key);
      if (!descriptor.enumerable) {
        const reason = `${at()}: non-enumerable property is not JSON`;
        path.pop();
        return fail(reason);
      }
      if ("get" in descriptor || "set" in descriptor) {
        const reason = `${at()}: accessor property is not JSON`;
        path.pop();
        return fail(reason);
      }
      const cloned = visit(descriptor.value);
      path.pop();
      if (error) return undefined;
      if (key === "__proto__") {
        Object.defineProperty(next, key, {
          value: cloned,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } else {
        next[key] = cloned;
      }
    }
    return next;
  };

  const cloned = visit(value);
  return error === null ? { ok: true, value: cloned as T } : { ok: false, reason: error };
}

function isArrayIndexKey(key: string): boolean {
  if (key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}

function arrayPropertyPathSegment(key: string): string | number {
  return isArrayIndexKey(key) ? Number(key) : key;
}
