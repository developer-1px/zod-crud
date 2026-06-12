import { appendSegment, type JSONCapabilityResult, type JSONDocument, type JSONPatchOperation, lastSegmentIndex, parentPointer, type Pointer, resolveSiblingRange, type SiblingRangeResult, tryParsePointer } from "@interactive-os/json-document";
import type { ItemLocation, WrapSelectionAdapter, WrapSelectionChange, WrapSelectionChangeResult, WrapSelectionError, WrapSelectionErrorCode, WrapSelectionOperation, WrapSelectionPlan, WrapSource } from "./types.js";

export function canWrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
  source: WrapSource,
): WrapSelectionChangeResult {
  const plan = planWrap(doc, adapter, source);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("wrap", plan.parent, capability);

  return copyChange(plan);
}

export function canUnwrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
  source: Pointer,
): WrapSelectionChangeResult {
  const plan = planUnwrap(doc, adapter, source);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("unwrap", plan.parent, capability);

  return copyChange(plan);
}

function planWrap<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
  source: WrapSource,
): { ok: true } & WrapSelectionPlan | WrapSelectionError {
  const locations = readSelectedLocations(doc, source, "wrap");
  if (!locations.ok) return locations;
  if (!isContiguous(locations.locations)) {
    return wrapSelectionError("non_contiguous_selection", "wrap source must be contiguous in its parent array", locations.locations[0]!.pointer, {
      operation: "wrap",
      parent: locations.locations[0]!.parent,
    });
  }

  const parent = locations.locations[0]!.parent;
  const firstIndex = locations.locations[0]!.index;
  const sourcePointers = locations.locations.map((location) => location.pointer);
  const children = locations.locations.map((location) => cloneJson(location.value));
  let wrapperValue: unknown;
  try {
    wrapperValue = adapter.createWrapper(children, {
      parent,
      insertIndex: firstIndex,
      source: sourcePointers,
    });
  } catch (error) {
    return wrapSelectionError(
      "wrapper_factory_failed",
      error instanceof Error ? error.message : "wrapper factory failed",
      sourcePointers[0],
      { operation: "wrap", parent },
    );
  }

  const operations: JSONPatchOperation[] = [
    ...[...locations.locations]
      .sort((left, right) => right.index - left.index)
      .map((location) => ({ op: "remove" as const, path: location.pointer })),
    { op: "add", path: appendSegment(parent, firstIndex), value: wrapperValue },
  ];

  return {
    ok: true,
    operation: "wrap",
    parent,
    source: sourcePointers,
    operations,
    selectionAfter: [appendSegment(parent, firstIndex)],
  };
}

function planUnwrap<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapSelectionAdapter,
  source: Pointer,
): { ok: true } & WrapSelectionPlan | WrapSelectionError {
  const location = readItemLocation(doc, source, "unwrap");
  if (!location.ok) return location;

  if (!adapter.isWrapper(location.location.value)) {
    return wrapSelectionError("not_wrapper", `source is not a wrapper: ${source}`, source, {
      operation: "unwrap",
      parent: location.location.parent,
    });
  }

  const children = adapter.getChildren(location.location.value);
  if (children === null) {
    return wrapSelectionError("not_wrapper", `source has no wrapper children: ${source}`, source, {
      operation: "unwrap",
      parent: location.location.parent,
    });
  }
  if (children.length === 0) {
    return wrapSelectionError("empty_wrapper", `wrapper has no children: ${source}`, source, {
      operation: "unwrap",
      parent: location.location.parent,
    });
  }

  const operations: JSONPatchOperation[] = [
    { op: "remove", path: location.location.pointer },
    ...children.map((child, index) => ({
      op: "add" as const,
      path: appendSegment(location.location.parent, location.location.index + index),
      value: cloneJson(child),
    })),
  ];
  const selectionAfter = children.map((_child, index) => (
    appendSegment(location.location.parent, location.location.index + index)
  ));

  return {
    ok: true,
    operation: "unwrap",
    parent: location.location.parent,
    source: [location.location.pointer],
    operations,
    selectionAfter,
  };
}

function readSelectedLocations<TDocument>(
  doc: JSONDocument<TDocument>,
  source: WrapSource,
  operation: WrapSelectionOperation,
): { ok: true; locations: ReadonlyArray<ItemLocation> } | WrapSelectionError {
  // Selected-sibling-range normalization (dedupe, prune nested, shared parent,
  // sort) is shared core (RFC #87). Item value + bounds reads stay local.
  const range = resolveSiblingRange(Array.isArray(source) ? source : [source], {
    dedupe: true,
    pruneDescendants: true,
  });
  if (!range.ok) return mapRangeError(range, operation);

  const parentRead = doc.at(range.parent);
  if (!parentRead.ok) {
    return wrapSelectionError(parentRead.code, parentRead.reason ?? `parent not found: ${range.parent}`, parentRead.pointer, {
      operation,
      parent: range.parent,
    });
  }
  if (!Array.isArray(parentRead.value)) {
    return wrapSelectionError("not_array_item", `parent is not an array: ${range.parent}`, range.parent, {
      operation,
      parent: range.parent,
    });
  }

  const items = parentRead.value;
  const locations: ItemLocation[] = [];
  for (const location of range.locations) {
    if (location.index >= items.length) {
      return wrapSelectionError("path_not_found", `item not found: ${location.pointer}`, location.pointer, {
        operation,
        parent: range.parent,
      });
    }
    locations.push({
      pointer: location.pointer,
      parent: location.parent,
      index: location.index,
      value: items[location.index],
    });
  }

  return { ok: true, locations };
}

function mapRangeError(
  range: Extract<SiblingRangeResult, { ok: false }>,
  operation: WrapSelectionOperation,
): WrapSelectionError {
  const code: WrapSelectionErrorCode =
    range.code === "non_contiguous" ? "non_contiguous_selection" : range.code;
  return wrapSelectionError(code, range.reason, range.pointer, { operation });
}

function readItemLocation<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  operation: WrapSelectionOperation,
): { ok: true; location: ItemLocation } | WrapSelectionError {
  if (tryParsePointer(pointer) === null) {
    return wrapSelectionError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer, { operation });
  }

  const parent = parentPointer(pointer);
  if (parent === null) {
    return wrapSelectionError("not_array_item", "root is not an array item", pointer, { operation });
  }

  const index = lastSegmentIndex(pointer);
  if (index === null) {
    return wrapSelectionError("not_array_item", `pointer does not address an array item: ${pointer}`, pointer, {
      operation,
      parent,
    });
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return wrapSelectionError(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parentRead.pointer, {
      operation,
      parent,
    });
  }
  if (!Array.isArray(parentRead.value)) {
    return wrapSelectionError("not_array_item", `parent is not an array: ${parent}`, pointer, {
      operation,
      parent,
    });
  }
  if (index >= parentRead.value.length) {
    return wrapSelectionError("path_not_found", `item not found: ${pointer}`, pointer, {
      operation,
      parent,
    });
  }

  return {
    ok: true,
    location: {
      pointer,
      parent,
      index,
      value: parentRead.value[index],
    },
  };
}

function isContiguous(locations: ReadonlyArray<ItemLocation>): boolean {
  return locations.every((location, offset) => (
    location.index === locations[0]!.index + offset
  ));
}

function copyChange(plan: WrapSelectionPlan): WrapSelectionChange {
  return {
    ok: true,
    operation: plan.operation,
    parent: plan.parent,
    source: [...plan.source],
    operations: cloneJson(plan.operations) as JSONPatchOperation[],
    selectionAfter: [...plan.selectionAfter],
  };
}

function capabilityError(
  operation: WrapSelectionOperation,
  parent: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): WrapSelectionError {
  const error = wrapSelectionError("patch_rejected", capability.reason ?? "wrap/unwrap patch rejected", capability.pointer, {
    operation,
    parent,
  });
  error.capability = capability;
  return error;
}

export function wrapSelectionError(
  code: WrapSelectionErrorCode,
  reason: string,
  pointer?: Pointer,
  options: { operation?: WrapSelectionOperation; parent?: Pointer } = {},
): WrapSelectionError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }), ...(options.operation === undefined ? {} : { operation: options.operation }), ...(options.parent === undefined ? {} : { parent: options.parent }) };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
