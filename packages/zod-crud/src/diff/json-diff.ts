import {
  formatPath,
  hasOwn,
  isJsonObject,
} from "../document/json-doc.js";
import type { JsonPath, JsonValue } from "../types.js";

export function sameJson(left: JsonValue, right: JsonValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => sameJson(item, right[index]!));
  }

  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();

    if (leftKeys.length !== rightKeys.length || !leftKeys.every((key, index) => key === rightKeys[index])) {
      return false;
    }

    return leftKeys.every((key) => sameJson(left[key]!, right[key]!));
  }

  return left === right;
}

export function firstJsonDifference(expected: JsonValue, actual: JsonValue, path: JsonPath = []): string | null {
  if (sameJson(expected, actual)) {
    return null;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return `${formatPath(path)} changed type from ${jsonType(actual)} to ${jsonType(expected)}`;
    }

    const length = Math.max(expected.length, actual.length);

    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length) {
        return `${formatPath([...path, index])} would be removed by schema`;
      }

      if (index >= actual.length) {
        return `${formatPath([...path, index])} would be added by schema`;
      }

      const difference = firstJsonDifference(expected[index]!, actual[index]!, [...path, index]);

      if (difference !== null) {
        return difference;
      }
    }

    return null;
  }

  if (isJsonObject(expected) || isJsonObject(actual)) {
    if (!isJsonObject(expected) || !isJsonObject(actual)) {
      return `${formatPath(path)} changed type from ${jsonType(actual)} to ${jsonType(expected)}`;
    }

    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();

    for (const key of keys) {
      if (!hasOwn(expected, key)) {
        return `${formatPath([...path, key])} would be removed by schema`;
      }

      if (!hasOwn(actual, key)) {
        return `${formatPath([...path, key])} would be added by schema`;
      }

      const difference = firstJsonDifference(expected[key]!, actual[key]!, [...path, key]);

      if (difference !== null) {
        return difference;
      }
    }

    return null;
  }

  return `${formatPath(path)} would change from ${JSON.stringify(actual)} to ${JSON.stringify(expected)}`;
}

function jsonType(value: JsonValue): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}
