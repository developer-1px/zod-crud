import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type GroupingSource = Pointer | ReadonlyArray<Pointer>;

export type GroupingOperation = "group" | "ungroup";

export type GroupingErrorCode =
  | "empty_selection"
  | "too_few_items"
  | "invalid_pointer"
  | "path_not_found"
  | "not_array_item"
  | "mixed_parent"
  | "non_contiguous_selection"
  | "not_group"
  | "empty_group"
  | "group_factory_failed"
  | "patch_rejected"
  | "patch_failed";

export interface GroupingCreateContext {
  parent: Pointer;
  insertIndex: number;
  source: ReadonlyArray<Pointer>;
}

export interface GroupingAdapter {
  isGroup(value: unknown): boolean;
  getChildren(value: unknown): ReadonlyArray<unknown> | null;
  createGroup(children: ReadonlyArray<unknown>, context: GroupingCreateContext): unknown;
}

export interface GroupingError {
  ok: false;
  code: GroupingErrorCode;
  reason: string;
  operation?: GroupingOperation;
  pointer?: Pointer;
  parent?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface GroupingChange {
  ok: true;
  operation: GroupingOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export type GroupingChangeResult = GroupingChange | GroupingError;

export type GroupingApplyResult =
  | (GroupingChange & { result: JSONResult })
  | GroupingError;

export interface Grouping<TDocument> {
  canGroup(source: GroupingSource): GroupingChangeResult;
  group(source: GroupingSource): GroupingApplyResult;
  canUngroup(source: Pointer): GroupingChangeResult;
  ungroup(source: Pointer): GroupingApplyResult;
}

interface ItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
  value: unknown;
}

interface GroupingPlan {
  operation: GroupingOperation;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
  selectionAfter: ReadonlyArray<Pointer>;
}

export function createGrouping<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
): Grouping<TDocument> {
  return {
    canGroup(source) {
      return canGroupSelection(doc, adapter, source);
    },
    group(source) {
      return groupSelection(doc, adapter, source);
    },
    canUngroup(source) {
      return canUngroupSelection(doc, adapter, source);
    },
    ungroup(source) {
      return ungroupSelection(doc, adapter, source);
    },
  };
}

export function canGroupSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: GroupingSource,
): GroupingChangeResult {
  const plan = planGroup(doc, adapter, source);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("group", "patch_rejected", plan.parent, capability);

  return copyChange(plan);
}

export function groupSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: GroupingSource,
): GroupingApplyResult {
  const change = canGroupSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("group", change.parent, result);

  return {
    ...change,
    result,
  };
}

export function canUngroupSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: Pointer,
): GroupingChangeResult {
  const plan = planUngroup(doc, adapter, source);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("ungroup", "patch_rejected", plan.parent, capability);

  return copyChange(plan);
}

export function ungroupSelection<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: Pointer,
): GroupingApplyResult {
  const change = canUngroupSelection(doc, adapter, source);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError("ungroup", change.parent, result);

  return {
    ...change,
    result,
  };
}

function planGroup<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: GroupingSource,
): { ok: true } & GroupingPlan | GroupingError {
  const locations = readSelectedLocations(doc, source, "group");
  if (!locations.ok) return locations;
  if (locations.locations.length < 2) {
    const first = locations.locations[0];
    return groupingError("too_few_items", "group needs at least two sibling items", first?.pointer, first === undefined
      ? { operation: "group" }
      : { operation: "group", parent: first.parent });
  }
  if (!isContiguous(locations.locations)) {
    return groupingError("non_contiguous_selection", "group source must be contiguous in its parent array", locations.locations[0]!.pointer, {
      operation: "group",
      parent: locations.locations[0]!.parent,
    });
  }

  const parent = locations.locations[0]!.parent;
  const firstIndex = locations.locations[0]!.index;
  const sourcePointers = locations.locations.map((location) => location.pointer);
  const children = locations.locations.map((location) => cloneJson(location.value));
  let groupValue: unknown;
  try {
    groupValue = adapter.createGroup(children, {
      parent,
      insertIndex: firstIndex,
      source: sourcePointers,
    });
  } catch (error) {
    return groupingError(
      "group_factory_failed",
      error instanceof Error ? error.message : "group factory failed",
      sourcePointers[0],
      { operation: "group", parent },
    );
  }

  const operations: JSONPatchOperation[] = [
    ...[...locations.locations]
      .sort((left, right) => right.index - left.index)
      .map((location) => ({ op: "remove" as const, path: location.pointer })),
    { op: "add", path: appendSegment(parent, firstIndex), value: groupValue },
  ];

  return {
    ok: true,
    operation: "group",
    parent,
    source: sourcePointers,
    operations,
    selectionAfter: [appendSegment(parent, firstIndex)],
  };
}

function planUngroup<TDocument>(
  doc: JSONDocument<TDocument>,
  adapter: GroupingAdapter,
  source: Pointer,
): { ok: true } & GroupingPlan | GroupingError {
  const location = readItemLocation(doc, source, "ungroup");
  if (!location.ok) return location;

  if (!adapter.isGroup(location.location.value)) {
    return groupingError("not_group", `source is not a group: ${source}`, source, {
      operation: "ungroup",
      parent: location.location.parent,
    });
  }

  const children = adapter.getChildren(location.location.value);
  if (children === null) {
    return groupingError("not_group", `source has no group children: ${source}`, source, {
      operation: "ungroup",
      parent: location.location.parent,
    });
  }
  if (children.length === 0) {
    return groupingError("empty_group", `group has no children: ${source}`, source, {
      operation: "ungroup",
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
    operation: "ungroup",
    parent: location.location.parent,
    source: [location.location.pointer],
    operations,
    selectionAfter,
  };
}

function readSelectedLocations<TDocument>(
  doc: JSONDocument<TDocument>,
  source: GroupingSource,
  operation: GroupingOperation,
): { ok: true; locations: ReadonlyArray<ItemLocation> } | GroupingError {
  const pointers = pruneDescendantPointers(uniquePointers(Array.isArray(source) ? source : [source]));
  if (pointers.length === 0) {
    return groupingError("empty_selection", "group source is empty", undefined, { operation });
  }

  const locations: ItemLocation[] = [];
  for (const pointer of pointers) {
    const location = readItemLocation(doc, pointer, operation);
    if (!location.ok) return location;
    locations.push(location.location);
  }

  const parent = locations[0]!.parent;
  if (locations.some((location) => location.parent !== parent)) {
    return groupingError("mixed_parent", "group source must share one parent array", parent, {
      operation,
      parent,
    });
  }

  return {
    ok: true,
    locations: locations.sort((left, right) => left.index - right.index),
  };
}

function readItemLocation<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  operation: GroupingOperation,
): { ok: true; location: ItemLocation } | GroupingError {
  if (tryParsePointer(pointer) === null) {
    return groupingError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer, { operation });
  }

  const parent = parentPointer(pointer);
  if (parent === null) {
    return groupingError("not_array_item", "root is not an array item", pointer, { operation });
  }

  const index = lastSegmentIndex(pointer);
  if (index === null) {
    return groupingError("not_array_item", `pointer does not address an array item: ${pointer}`, pointer, {
      operation,
      parent,
    });
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return groupingError(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parentRead.pointer, {
      operation,
      parent,
    });
  }
  if (!Array.isArray(parentRead.value)) {
    return groupingError("not_array_item", `parent is not an array: ${parent}`, pointer, {
      operation,
      parent,
    });
  }
  if (index >= parentRead.value.length) {
    return groupingError("path_not_found", `item not found: ${pointer}`, pointer, {
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

function uniquePointers(pointers: ReadonlyArray<Pointer>): Pointer[] {
  return [...new Set(pointers)];
}

function pruneDescendantPointers(pointers: ReadonlyArray<Pointer>): Pointer[] {
  return pointers.filter((pointer) => (
    !pointers.some((candidate) => candidate !== pointer && isDescendantOf(pointer, candidate))
  ));
}

function isContiguous(locations: ReadonlyArray<ItemLocation>): boolean {
  return locations.every((location, offset) => (
    location.index === locations[0]!.index + offset
  ));
}

function isDescendantOf(pointer: Pointer, candidateAncestor: Pointer): boolean {
  return candidateAncestor === ""
    ? pointer !== ""
    : pointer.startsWith(`${candidateAncestor}/`);
}

function copyChange(plan: GroupingPlan): GroupingChange {
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
  operation: GroupingOperation,
  code: "patch_rejected",
  parent: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): GroupingError {
  const error = groupingError(code, capability.reason ?? "grouping patch rejected", capability.pointer, {
    operation,
    parent,
  });
  error.capability = capability;
  return error;
}

function patchError(
  operation: GroupingOperation,
  parent: Pointer,
  result: Exclude<JSONResult, { ok: true }>,
): GroupingError {
  const error = groupingError("patch_failed", result.reason ?? "grouping patch failed", result.pointer, {
    operation,
    parent,
  });
  error.result = result;
  return error;
}

function groupingError(
  code: GroupingErrorCode,
  reason: string,
  pointer?: Pointer,
  options: { operation?: GroupingOperation; parent?: Pointer } = {},
): GroupingError {
  const error: GroupingError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  if (options.operation !== undefined) error.operation = options.operation;
  if (options.parent !== undefined) error.parent = options.parent;
  return error;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
