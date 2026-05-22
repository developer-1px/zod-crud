// Internal JSON boundary helpers. Public state/actions must stay plain JSON.

import { buildPointer } from "./json-pointer/index.js";

type JSONPrimitive = string | number | boolean | null;
export type JSONValue =
  | JSONPrimitive
  | { readonly [key: string]: JSONValue }
  | ReadonlyArray<JSONValue>;

const LARGE_ARRAY_CLONE_THRESHOLD = 1024;

export function jsonSerializableError(value: unknown): string | null {
  return jsonSerializableErrorFast(value) === null ? null : jsonSerializableErrorDetailed(value);
}

function jsonSerializableErrorFast(value: unknown): string | null {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const v = stack.pop();
    if (v === null) continue;
    const t = typeof v;
    if (t === "string" || t === "boolean") continue;
    if (t === "number") {
      if (!Number.isFinite(v)) return "non-finite number";
      continue;
    }
    if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") return `${t} is not JSON`;
    if (t !== "object") continue;

    const obj = v as object;
    if (seen.has(obj)) return "circular reference";
    seen.add(obj);

    if (Array.isArray(v)) {
      if (Object.getOwnPropertySymbols(v).length > 0) return "symbol keys are not JSON";
      for (let index = 0; index < v.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(v, String(index));
        if (!descriptor) return "sparse array hole";
        if (!descriptor.enumerable) return "non-enumerable property is not JSON";
        if ("get" in descriptor || "set" in descriptor) return "accessor property is not JSON";
        const child = descriptor.value;
        if (child !== null) {
          const childType = typeof child;
          if (childType === "object") stack.push(child);
          else if (childType === "number") {
            if (!Number.isFinite(child)) return "non-finite number";
          } else if (childType !== "string" && childType !== "boolean") {
            return `${childType} is not JSON`;
          }
        }
      }
      if (Object.getOwnPropertyNames(v).length !== v.length + 1) return "non-index array property is not JSON";
      continue;
    }

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return "non-plain object";

    if (Object.getOwnPropertySymbols(v).length > 0) return "symbol keys are not JSON";

    for (const key of Object.getOwnPropertyNames(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor) continue;
      if (!descriptor.enumerable) return "non-enumerable property is not JSON";
      if ("get" in descriptor || "set" in descriptor) return "accessor property is not JSON";
      const child = descriptor.value;
      if (child !== null) {
        const childType = typeof child;
        if (childType === "object") stack.push(child);
        else if (childType === "number") {
          if (!Number.isFinite(child)) return "non-finite number";
        } else if (childType !== "string" && childType !== "boolean") {
          return `${childType} is not JSON`;
        }
      }
    }
  }

  return null;
}

function jsonSerializableErrorDetailed(value: unknown): string | null {
  const seen = new WeakSet<object>();
  const path: Array<string | number> = [];

  const at = (): string => buildPointer(path);

  const visit = (v: unknown): string | null => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return null;
    if (t === "number") return Number.isFinite(v) ? null : `${at()}: non-finite number`;
    if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") {
      return `${at()}: ${t} is not JSON`;
    }
    if (t !== "object") return null;

    const obj = v as object;
    if (seen.has(obj)) return `${at()}: circular reference`;
    seen.add(obj);

    if (Array.isArray(v)) {
      if (Object.getOwnPropertySymbols(v).length > 0) return `${at()}: symbol keys are not JSON`;
      for (let i = 0; i < v.length; i++) {
        path.push(i);
        const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
        if (!descriptor) {
          const message = `${at()}: sparse array hole`;
          path.pop();
          return message;
        }
        if (!descriptor.enumerable) {
          const message = `${at()}: non-enumerable property is not JSON`;
          path.pop();
          return message;
        }
        if ("get" in descriptor || "set" in descriptor) {
          const message = `${at()}: accessor property is not JSON`;
          path.pop();
          return message;
        }
        const err = visit(descriptor.value);
        path.pop();
        if (err) return err;
      }
      if (Object.getOwnPropertyNames(v).length !== v.length + 1) {
        for (const key of Object.getOwnPropertyNames(v)) {
          if (key === "length" || isArrayIndexKey(key)) continue;
          path.push(arrayPropertyPathSegment(key));
          const message = `${at()}: non-index array property is not JSON`;
          path.pop();
          return message;
        }
      }
      return null;
    }

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      const name = proto?.constructor?.name ?? "unknown";
      return `${at()}: non-plain object (${name})`;
    }

    if (Object.getOwnPropertySymbols(v).length > 0) return `${at()}: symbol keys are not JSON`;

    for (const key of Object.getOwnPropertyNames(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor) continue;
      path.push(key);
      if (!descriptor.enumerable) {
        const message = `${at()}: non-enumerable property is not JSON`;
        path.pop();
        return message;
      }
      if ("get" in descriptor || "set" in descriptor) {
        const message = `${at()}: accessor property is not JSON`;
        path.pop();
        return message;
      }
      const err = visit(descriptor.value);
      path.pop();
      if (err) return err;
    }
    return null;
  };

  return visit(value);
}

function isArrayIndexKey(key: string): boolean {
  if (key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}

function arrayPropertyPathSegment(key: string): string | number {
  return isArrayIndexKey(key) ? Number(key) : key;
}

export type CloneJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export function cloneJson<T>(value: T): T {
  const result = cloneJsonSerializable(value);
  if (!result.ok) throw new TypeError(`Value is not JSON-serializable: ${result.reason}`);
  return result.value;
}

export function cloneJsonSerializable<T>(value: T): CloneJsonResult<T> {
  if (Array.isArray(value) && value.length >= LARGE_ARRAY_CLONE_THRESHOLD) {
    const reason = jsonSerializableErrorFast(value);
    return reason === null
      ? { ok: true, value: cloneTrustedJson(value) as T }
      : cloneJsonSerializableDetailed(value);
  }
  const fast = cloneJsonSerializableFast(value);
  return fast.ok ? fast : cloneJsonSerializableDetailed(value);
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

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return fail("non-plain object");

    const next: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor) continue;
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

export function cloneTrustedJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const next = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      next[index] = cloneTrustedJson(value[index]);
    }
    return next as T;
  }

  const next: Record<string, unknown> = {};
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const cloned = cloneTrustedJson((value as Record<string, unknown>)[key]);
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
  return next as T;
}

export function jsonEqual(left: JSONValue | undefined, right: JSONValue | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    if (left.length !== (right as ReadonlyArray<JSONValue>).length) return false;
    return left.every((value, index) => jsonEqual(value, (right as ReadonlyArray<JSONValue>)[index]!));
  }
  const leftObject = left as Record<string, JSONValue>;
  const rightObject = right as Record<string, JSONValue>;
  const leftKeys = Object.keys(leftObject);
  if (leftKeys.length !== Object.keys(rightObject).length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightObject, key)
    && jsonEqual(leftObject[key]!, rightObject[key]!));
}
