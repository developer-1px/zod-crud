// Internal JSON boundary helpers. Public state/actions must stay plain JSON.

import { buildPointer } from "./json-pointer/index.js";

type JSONPrimitive = string | number | boolean | null;
export type JSONValue =
  | JSONPrimitive
  | { readonly [key: string]: JSONValue }
  | ReadonlyArray<JSONValue>;

export function jsonSerializableError(value: unknown): string | null {
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

function assertJsonSerializable(value: unknown): void {
  const reason = jsonSerializableError(value);
  if (reason !== null) throw new TypeError(`Value is not JSON-serializable: ${reason}`);
}

export function cloneJson<T>(value: T): T {
  assertJsonSerializable(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneTrustedJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
