import { buildPointer } from "./json-pointer/pointerCore.js";

export function jsonSerializableError(value: unknown): string | null {
  return jsonSerializableErrorFast(value) === null ? null : jsonSerializableErrorDetailed(value);
}

export function jsonSerializableErrorFast(value: unknown): string | null {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [value];
  let stackLength = 1;

  while (stackLength > 0) {
    const v = stack[--stackLength];
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
      const names = Object.getOwnPropertyNames(v);
      if (names.length !== v.length + 1) return "non-index array property is not JSON";
      if (names[names.length - 1] !== "length") return "non-index array property is not JSON";
      for (let index = 0; index < v.length; index += 1) {
        const key = names[index];
        if (key !== String(index)) return "sparse array hole";
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        if (!descriptor) return "sparse array hole";
        if (!descriptor.enumerable) return "non-enumerable property is not JSON";
        if ("get" in descriptor || "set" in descriptor) return "accessor property is not JSON";
        const child = descriptor.value;
        if (child !== null) {
          const childType = typeof child;
          if (childType === "object") {
            stack[stackLength] = child;
            stackLength += 1;
          } else if (childType === "number") {
            if (!Number.isFinite(child)) return "non-finite number";
          } else if (childType !== "string" && childType !== "boolean") {
            return `${childType} is not JSON`;
          }
        }
      }
      continue;
    }

    const objectValue = v as object;
    const proto = Object.getPrototypeOf(objectValue);
    if (proto !== Object.prototype && proto !== null) return "non-plain object";

    if (Object.getOwnPropertySymbols(objectValue).length > 0) return "symbol keys are not JSON";

    const keys = Object.getOwnPropertyNames(objectValue);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
      if (!descriptor) return "non-enumerable property is not JSON";
      if (!descriptor.enumerable) return "non-enumerable property is not JSON";
      if ("get" in descriptor || "set" in descriptor) return "accessor property is not JSON";
      const child = descriptor.value;
      if (child !== null) {
        const childType = typeof child;
        if (childType === "object") {
          stack[stackLength] = child;
          stackLength += 1;
        } else if (childType === "number") {
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
