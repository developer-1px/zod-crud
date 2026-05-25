import type { Match, Query, Selector } from "./types.js";
import { matchArrayWildcardFieldPointers } from "./fast.js";
import { escapeSeg, normalizeSliceIndex, objectHasOwn } from "./support.js";

export function evaluateSinglePathQuery(query: Query, root: unknown): Match[] | null {
  if (query.segments.length === 0) return [{ pointer: "", value: root }];

  let value = root;
  let pointer = "";
  for (let segmentIndex = 0; segmentIndex < query.segments.length; segmentIndex += 1) {
    const segment = query.segments[segmentIndex]!;
    if (segment.kind !== "child" || segment.selectors.length !== 1) return null;

    const selector = segment.selectors[0]!;
    if (selector.kind === "name") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
      const object = value as Record<string, unknown>;
      if (!objectHasOwn.call(object, selector.name)) return [];
      value = object[selector.name];
      pointer += "/" + escapeSeg(selector.name);
      continue;
    }

    if (selector.kind === "index") {
      if (!Array.isArray(value)) return [];
      const index = selector.index < 0 ? value.length + selector.index : selector.index;
      if (index < 0 || index >= value.length) return [];
      value = value[index];
      pointer += "/" + index;
      continue;
    }

    return null;
  }

  return [{ pointer, value }];
}

export function evaluateSimpleQuery(query: Query, root: unknown): Match[] | null {
  let matches: Match[] = [{ pointer: "", value: root }];

  for (let segmentIndex = 0; segmentIndex < query.segments.length; segmentIndex += 1) {
    const segment = query.segments[segmentIndex]!;
    if (segment.kind !== "child") return null;

    const next: Match[] = [];
    for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      const match = matches[matchIndex]!;
      for (let selectorIndex = 0; selectorIndex < segment.selectors.length; selectorIndex += 1) {
        if (!applySimpleMatchSelector(segment.selectors[selectorIndex]!, match, next)) {
          return null;
        }
      }
    }
    matches = next;
  }

  return matches;
}

export function matchPointersForSimpleQuery(query: Query, root: unknown): string[] | null {
  const arrayFieldPointers = matchArrayWildcardFieldPointers(query, root);
  if (arrayFieldPointers !== null) return arrayFieldPointers;

  let values: unknown[] = [root];
  let pointers: string[] = [""];

  for (let segmentIndex = 0; segmentIndex < query.segments.length; segmentIndex += 1) {
    const segment = query.segments[segmentIndex]!;
    if (segment.kind !== "child") return null;

    const isFinalSegment = segmentIndex === query.segments.length - 1;
    const nextValues: unknown[] | null = isFinalSegment ? null : [];
    const nextPointers: string[] = [];
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex];
      const pointer = pointers[valueIndex]!;
      for (const selector of segment.selectors) {
        if (!applySimpleSelector(selector, value, pointer, nextValues, nextPointers)) return null;
      }
    }
    if (nextValues === null) return nextPointers;
    values = nextValues;
    pointers = nextPointers;
  }

  return pointers;
}

function applySimpleSelector(
  selector: Selector,
  value: unknown,
  pointer: string,
  nextValues: unknown[] | null,
  nextPointers: string[],
): boolean {
  switch (selector.kind) {
    case "name": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return true;
      const object = value as Record<string, unknown>;
      if (!objectHasOwn.call(object, selector.name)) return true;
      nextValues?.push(object[selector.name]);
      nextPointers.push(pointer + "/" + escapeSeg(selector.name));
      return true;
    }
    case "index": {
      if (!Array.isArray(value)) return true;
      const index = selector.index < 0 ? value.length + selector.index : selector.index;
      if (index < 0 || index >= value.length) return true;
      nextValues?.push(value[index]);
      nextPointers.push(pointer + "/" + index);
      return true;
    }
    case "slice": {
      if (!Array.isArray(value)) return true;
      const step = selector.step;
      if (step === 0) return true;
      const start = normalizeSliceIndex(selector.start, value.length, step, true);
      const end = normalizeSliceIndex(selector.end, value.length, step, false);
      if (step > 0) {
        for (let index = start; index < end; index += step) {
          nextValues?.push(value[index]);
          nextPointers.push(pointer + "/" + index);
        }
      } else {
        for (let index = start; index > end; index += step) {
          nextValues?.push(value[index]);
          nextPointers.push(pointer + "/" + index);
        }
      }
      return true;
    }
    case "wildcard": {
      if (value === null || typeof value !== "object") return true;
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          nextValues?.push(value[index]);
          nextPointers.push(pointer + "/" + index);
        }
        return true;
      }
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index]!;
        nextValues?.push(object[key]);
        nextPointers.push(pointer + "/" + escapeSeg(key));
      }
      return true;
    }
    case "filter":
      return false;
  }
}

function applySimpleMatchSelector(
  selector: Selector,
  match: Match,
  next: Match[],
): boolean {
  switch (selector.kind) {
    case "name": {
      const value = match.value;
      if (value === null || typeof value !== "object" || Array.isArray(value)) return true;
      const object = value as Record<string, unknown>;
      if (!objectHasOwn.call(object, selector.name)) return true;
      next.push({
        pointer: match.pointer + "/" + escapeSeg(selector.name),
        value: object[selector.name],
      });
      return true;
    }
    case "index": {
      const value = match.value;
      if (!Array.isArray(value)) return true;
      const index = selector.index < 0 ? value.length + selector.index : selector.index;
      if (index < 0 || index >= value.length) return true;
      next.push({ pointer: match.pointer + "/" + index, value: value[index] });
      return true;
    }
    case "slice": {
      const value = match.value;
      if (!Array.isArray(value)) return true;
      const step = selector.step;
      if (step === 0) return true;
      const start = normalizeSliceIndex(selector.start, value.length, step, true);
      const end = normalizeSliceIndex(selector.end, value.length, step, false);
      if (step > 0) {
        for (let index = start; index < end; index += step) {
          next.push({ pointer: match.pointer + "/" + index, value: value[index] });
        }
      } else {
        for (let index = start; index > end; index += step) {
          next.push({ pointer: match.pointer + "/" + index, value: value[index] });
        }
      }
      return true;
    }
    case "wildcard": {
      const value = match.value;
      if (value === null || typeof value !== "object") return true;
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          next.push({ pointer: match.pointer + "/" + index, value: value[index] });
        }
        return true;
      }
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index]!;
        next.push({ pointer: match.pointer + "/" + escapeSeg(key), value: object[key] });
      }
      return true;
    }
    case "filter":
      return false;
  }
}
