import type { JsonPath } from "../types.js";

export function formatPath(path: JsonPath): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((text, segment) => {
    if (typeof segment === "number") {
      return `${text}[${segment}]`;
    }

    return `${text}.${segment}`;
  }, "$");
}
