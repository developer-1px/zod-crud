import type { JSONValue } from "./jsonTypes.js";

const objectHasOwn = Object.prototype.hasOwnProperty;

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
  return leftKeys.every((key) => objectHasOwn.call(rightObject, key)
    && jsonEqual(leftObject[key]!, rightObject[key]!));
}
