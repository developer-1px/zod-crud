import { appendSegment, type JSONCapabilityResult, type JSONDocument, type JSONPatchOperation, lastSegmentIndex, parentPointer, type Pointer, resolveSiblingRange, type SiblingRangeResult, tryParsePointer } from "@interactive-os/json-document";
import type { GroupingAdapter, GroupingChange, GroupingChangeResult, GroupingError, GroupingErrorCode, GroupingOperation, GroupingPlan, GroupingSource, ItemLocation } from "./types.js";

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
  // Selected-sibling-range normalization (dedupe, prune nested, shared parent,
  // sort) is shared core (RFC #87). Item value + bounds reads stay local.
  const range = resolveSiblingRange(Array.isArray(source) ? source : [source], {
    dedupe: true,
    pruneDescendants: true,
  });
  if (!range.ok) return mapRangeError(range, operation);

  const parentRead = doc.at(range.parent);
  if (!parentRead.ok) {
    return groupingError(parentRead.code, parentRead.reason ?? `parent not found: ${range.parent}`, parentRead.pointer, {
      operation,
      parent: range.parent,
    });
  }
  if (!Array.isArray(parentRead.value)) {
    return groupingError("not_array_item", `parent is not an array: ${range.parent}`, range.parent, {
      operation,
      parent: range.parent,
    });
  }

  const items = parentRead.value;
  const locations: ItemLocation[] = [];
  for (const location of range.locations) {
    if (location.index >= items.length) {
      return groupingError("path_not_found", `item not found: ${location.pointer}`, location.pointer, {
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
  operation: GroupingOperation,
): GroupingError {
  const code: GroupingErrorCode =
    range.code === "non_contiguous" ? "non_contiguous_selection" : range.code;
  return groupingError(code, range.reason, range.pointer, { operation });
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

function isContiguous(locations: ReadonlyArray<ItemLocation>): boolean {
  return locations.every((location, offset) => (
    location.index === locations[0]!.index + offset
  ));
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

export function groupingError(
  code: GroupingErrorCode,
  reason: string,
  pointer?: Pointer,
  options: { operation?: GroupingOperation; parent?: Pointer } = {},
): GroupingError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }), ...(options.operation === undefined ? {} : { operation: options.operation }), ...(options.parent === undefined ? {} : { parent: options.parent }) };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
