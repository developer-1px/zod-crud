import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  resolveSiblingRange,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type SiblingRangeResult,
} from "zod-crud";

export type WrapSource = Pointer | ReadonlyArray<Pointer>;

export type WrapUnwrapOperation = "wrap" | "unwrap";

export type WrapUnwrapErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "path_not_found"
  | "not_array_item"
  | "mixed_parent"
  | "non_contiguous_selection"
  | "not_wrapper"
  | "empty_wrapper"
  | "wrapper_factory_failed"
  | "patch_rejected"
  | "patch_failed";

export interface WrapCreateContext {
  parent: Pointer;
  insertIndex: number;
  source: ReadonlyArray<Pointer>;
}

export interface WrapUnwrapAdapter {
  isWrapper(value: unknown): boolean;
  getChildren(value: unknown): ReadonlyArray<unknown> | null;
  createWrapper(children: ReadonlyArray<unknown>, context: WrapCreateContext): unknown;
}

export interface WrapUnwrapError {
  ok: false;
  code: WrapUnwrapErrorCode;
  reason: string;
  operation?: WrapUnwrapOperation;
  pointer?: Pointer;
  parent?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface WrapUnwrapChange {
  ok: true;
  operation: WrapUnwrapOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export type WrapUnwrapChangeResult = WrapUnwrapChange | WrapUnwrapError;

export type WrapUnwrapApplyResult =
  | (WrapUnwrapChange & { result: JSONResult })
  | WrapUnwrapError;

export interface WrapUnwrap<TDocument> {
  canWrap(source: WrapSource): WrapUnwrapChangeResult;
  wrap(source: WrapSource): WrapUnwrapApplyResult;
  canUnwrap(source: Pointer): WrapUnwrapChangeResult;
  unwrap(source: Pointer): WrapUnwrapApplyResult;
}

interface ItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  value: unknown;
}

interface WrapUnwrapPlan {
  operation: WrapUnwrapOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export function createWrapUnwrap<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapUnwrapAdapter,
): WrapUnwrap<TDocument> {
  return {
    canWrap(source) {
      return canWrapSelection(doc, adapter, source);
    },
    wrap(source) {
      return wrapSelection(doc, adapter, source);
    },
    canUnwrap(source) {
      return canUnwrapSelection(doc, adapter, source);
    },
    unwrap(source) {
      return unwrapSelection(doc, adapter, source);
    },
  };
}

export function canWrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapUnwrapAdapter,
  source: WrapSource,
): WrapUnwrapChangeResult {
  const plan = planWrap(doc, adapter, source);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("wrap", plan.parent, capability);

  return copyChange(plan);
}

export function wrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapUnwrapAdapter,
  source: WrapSource,
): WrapUnwrapApplyResult {
  const change = canWrapSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("wrap", change.parent, result);

  return {
    ...change,
    result,
  };
}

export function canUnwrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapUnwrapAdapter,
  source: Pointer,
): WrapUnwrapChangeResult {
  const plan = planUnwrap(doc, adapter, source);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("unwrap", plan.parent, capability);

  return copyChange(plan);
}

export function unwrapSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapUnwrapAdapter,
  source: Pointer,
): WrapUnwrapApplyResult {
  const change = canUnwrapSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("unwrap", change.parent, result);

  return {
    ...change,
    result,
  };
}

function planWrap<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: WrapUnwrapAdapter,
  source: WrapSource,
): { ok: true } & WrapUnwrapPlan | WrapUnwrapError {
  const locations = readSelectedLocations(doc, source, "wrap");
  if (!locations.ok) return locations;
  if (!isContiguous(locations.locations)) {
    return wrapUnwrapError("non_contiguous_selection", "wrap source must be contiguous in its parent array", locations.locations[0]!.pointer, {
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
    return wrapUnwrapError(
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
  adapter: WrapUnwrapAdapter,
  source: Pointer,
): { ok: true } & WrapUnwrapPlan | WrapUnwrapError {
  const location = readItemLocation(doc, source, "unwrap");
  if (!location.ok) return location;

  if (!adapter.isWrapper(location.location.value)) {
    return wrapUnwrapError("not_wrapper", `source is not a wrapper: ${source}`, source, {
      operation: "unwrap",
      parent: location.location.parent,
    });
  }

  const children = adapter.getChildren(location.location.value);
  if (children === null) {
    return wrapUnwrapError("not_wrapper", `source has no wrapper children: ${source}`, source, {
      operation: "unwrap",
      parent: location.location.parent,
    });
  }
  if (children.length === 0) {
    return wrapUnwrapError("empty_wrapper", `wrapper has no children: ${source}`, source, {
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
  operation: WrapUnwrapOperation,
): { ok: true; locations: ReadonlyArray<ItemLocation> } | WrapUnwrapError {
  // Selected-sibling-range normalization (dedupe, prune nested, shared parent,
  // sort) is shared core (RFC #87). Item value + bounds reads stay local.
  const range = resolveSiblingRange(Array.isArray(source) ? source : [source], {
    dedupe: true,
    pruneDescendants: true,
  });
  if (!range.ok) return mapRangeError(range, operation);

  const parentRead = doc.at(range.parent);
  if (!parentRead.ok) {
    return wrapUnwrapError(parentRead.code, parentRead.reason ?? `parent not found: ${range.parent}`, parentRead.pointer, {
      operation,
      parent: range.parent,
    });
  }
  if (!Array.isArray(parentRead.value)) {
    return wrapUnwrapError("not_array_item", `parent is not an array: ${range.parent}`, range.parent, {
      operation,
      parent: range.parent,
    });
  }

  const items = parentRead.value;
  const locations: ItemLocation[] = [];
  for (const location of range.locations) {
    if (location.index >= items.length) {
      return wrapUnwrapError("path_not_found", `item not found: ${location.pointer}`, location.pointer, {
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
  operation: WrapUnwrapOperation,
): WrapUnwrapError {
  const code: WrapUnwrapErrorCode =
    range.code === "non_contiguous" ? "non_contiguous_selection" : range.code;
  return wrapUnwrapError(code, range.reason, range.pointer, { operation });
}

function readItemLocation<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  operation: WrapUnwrapOperation,
): { ok: true; location: ItemLocation } | WrapUnwrapError {
  if (tryParsePointer(pointer) === null) {
    return wrapUnwrapError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer, { operation });
  }

  const parent = parentPointer(pointer);
  if (parent === null) {
    return wrapUnwrapError("not_array_item", "root is not an array item", pointer, { operation });
  }

  const index = lastSegmentIndex(pointer);
  if (index === null) {
    return wrapUnwrapError("not_array_item", `pointer does not address an array item: ${pointer}`, pointer, {
      operation,
      parent,
    });
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return wrapUnwrapError(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parentRead.pointer, {
      operation,
      parent,
    });
  }
  if (!Array.isArray(parentRead.value)) {
    return wrapUnwrapError("not_array_item", `parent is not an array: ${parent}`, pointer, {
      operation,
      parent,
    });
  }
  if (index >= parentRead.value.length) {
    return wrapUnwrapError("path_not_found", `item not found: ${pointer}`, pointer, {
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

function copyChange(plan: WrapUnwrapPlan): WrapUnwrapChange {
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
  operation: WrapUnwrapOperation,
  parent: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): WrapUnwrapError {
  const error = wrapUnwrapError("patch_rejected", capability.reason ?? "wrap/unwrap patch rejected", capability.pointer, {
    operation,
    parent,
  });
  error.capability = capability;
  return error;
}

function patchError(
  operation: WrapUnwrapOperation,
  parent: Pointer,
  result: Exclude<JSONResult, { ok: true }>,
): WrapUnwrapError {
  const error = wrapUnwrapError("patch_failed", result.reason ?? "wrap/unwrap patch failed", result.pointer, {
    operation,
    parent,
  });
  error.result = result;
  return error;
}

function wrapUnwrapError(
  code: WrapUnwrapErrorCode,
  reason: string,
  pointer?: Pointer,
  options: { operation?: WrapUnwrapOperation; parent?: Pointer } = {},
): WrapUnwrapError {
  const error: WrapUnwrapError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  if (options.operation !== undefined) error.operation = options.operation;
  if (options.parent !== undefined) error.parent = options.parent;
  return error;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
