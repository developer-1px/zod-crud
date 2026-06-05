import type {
  ProtectedRange,
} from "./types.js";

export function copyRange(range: ProtectedRange): ProtectedRange {
  return {
    id: range.id,
    pointer: range.pointer,
    ...(range.label === undefined ? {} : { label: range.label }),
  };
}
