import type {
  DirtyStateComparator,
  DirtyStateSnapshot,
} from "./types.js";

export function readSnapshot<T>(
  value: T,
  baseline: T,
  baselineSignature: string,
  equals: DirtyStateComparator<T> | undefined,
): DirtyStateSnapshot<T> {
  const clonedValue = cloneJson(value);
  return {
    dirty: readDirtyValue(clonedValue, baseline, baselineSignature, equals),
    value: clonedValue,
    baseline: cloneJson(baseline),
  };
}

export function readDirtyValue<T>(
  value: T,
  baseline: T,
  baselineSignature: string,
  equals: DirtyStateComparator<T> | undefined,
): boolean {
  if (equals !== undefined) return !equals(value, baseline);
  return jsonSignature(value) !== baselineSignature;
}

export function copySnapshot<T>(snapshot: DirtyStateSnapshot<T>): DirtyStateSnapshot<T> {
  return {
    dirty: snapshot.dirty,
    value: cloneJson(snapshot.value),
    baseline: cloneJson(snapshot.baseline),
  };
}

export function cloneJson<T>(value: T): T {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined as T;
  return JSON.parse(text) as T;
}

export function jsonSignature(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? "undefined" : text;
}
