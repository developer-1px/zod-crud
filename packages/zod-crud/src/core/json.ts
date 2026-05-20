// Internal JSON boundary helpers. Public state/actions must stay plain JSON.

import { buildPointer } from "./pointer/index.js";

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue =
  | JSONPrimitive
  | { readonly [key: string]: JSONValue }
  | ReadonlyArray<JSONValue>;

export function jsonSerializableError(value: unknown): string | null {
  const seen = new WeakSet<object>();

  const at = (path: ReadonlyArray<string | number>): string => buildPointer(path);

  const visit = (v: unknown, path: ReadonlyArray<string | number>): string | null => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return null;
    if (t === "number") return Number.isFinite(v) ? null : `${at(path)}: non-finite number`;
    if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") {
      return `${at(path)}: ${t} is not JSON`;
    }
    if (t !== "object") return null;

    const obj = v as object;
    if (seen.has(obj)) return `${at(path)}: circular reference`;
    seen.add(obj);

    if (Array.isArray(v)) {
      for (const key of Object.getOwnPropertyNames(v)) {
        if (key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        if (!descriptor) continue;
        const childPath = [...path, arrayPropertyPathSegment(key)];
        if (!isArrayIndexKey(key)) return `${at(childPath)}: non-index array property is not JSON`;
        if (!descriptor.enumerable) return `${at(childPath)}: non-enumerable property is not JSON`;
        if ("get" in descriptor || "set" in descriptor) return `${at(childPath)}: accessor property is not JSON`;
      }
      if (Object.getOwnPropertySymbols(v).length > 0) return `${at(path)}: symbol keys are not JSON`;
      for (let i = 0; i < v.length; i++) {
        const childPath = [...path, i];
        if (!Object.prototype.hasOwnProperty.call(v, i)) return `${at(childPath)}: sparse array hole`;
        const err = visit(v[i], childPath);
        if (err) return err;
      }
      return null;
    }

    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      const name = proto?.constructor?.name ?? "unknown";
      return `${at(path)}: non-plain object (${name})`;
    }

    if (Object.getOwnPropertySymbols(v).length > 0) return `${at(path)}: symbol keys are not JSON`;

    for (const key of Object.getOwnPropertyNames(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor) continue;
      const childPath = [...path, key];
      if (!descriptor.enumerable) return `${at(childPath)}: non-enumerable property is not JSON`;
      if ("get" in descriptor || "set" in descriptor) return `${at(childPath)}: accessor property is not JSON`;
    }

    for (const key of Object.keys(v as Record<string, unknown>)) {
      const err = visit((v as Record<string, unknown>)[key], [...path, key]);
      if (err) return err;
    }
    return null;
  };

  return visit(value, []);
}

function isArrayIndexKey(key: string): boolean {
  if (key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}

function arrayPropertyPathSegment(key: string): string | number {
  return isArrayIndexKey(key) ? Number(key) : key;
}

export function assertJsonSerializable(value: unknown): void {
  const reason = jsonSerializableError(value);
  if (reason !== null) throw new TypeError(`Value is not JSON-serializable: ${reason}`);
}

export function cloneJson<T>(value: T): T {
  assertJsonSerializable(value);
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
