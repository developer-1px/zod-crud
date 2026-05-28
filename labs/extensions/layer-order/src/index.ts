import {
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type LayerOrderAction =
  | "bringForward"
  | "bringToFront"
  | "sendBackward"
  | "sendToBack";

export type LayerOrderSource = Pointer | ReadonlyArray<Pointer>;

export type LayerOrderErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "path_not_found"
  | "not_layer_item"
  | "mixed_parent"
  | "order_boundary"
  | "patch_rejected"
  | "patch_failed";

export interface LayerOrderError {
  ok: false;
  code: LayerOrderErrorCode;
  reason: string;
  pointer?: Pointer;
  parent?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface LayerOrderChange {
  ok: true;
  action: LayerOrderAction;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type LayerOrderChangeResult =
  | LayerOrderChange
  | LayerOrderError;

export type LayerOrderApplyResult =
  | (LayerOrderChange & { result: JSONResult })
  | LayerOrderError;

interface LayerItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
}

interface LayerOrderPlan {
  action: LayerOrderAction;
  parent: Pointer;
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export interface LayerOrder<TDocument> {
  canReorder(source: LayerOrderSource, action: LayerOrderAction): LayerOrderChangeResult;
  reorder(source: LayerOrderSource, action: LayerOrderAction): LayerOrderApplyResult;
  canBringForward(source: LayerOrderSource): LayerOrderChangeResult;
  bringForward(source: LayerOrderSource): LayerOrderApplyResult;
  canBringToFront(source: LayerOrderSource): LayerOrderChangeResult;
  bringToFront(source: LayerOrderSource): LayerOrderApplyResult;
  canSendBackward(source: LayerOrderSource): LayerOrderChangeResult;
  sendBackward(source: LayerOrderSource): LayerOrderApplyResult;
  canSendToBack(source: LayerOrderSource): LayerOrderChangeResult;
  sendToBack(source: LayerOrderSource): LayerOrderApplyResult;
}

export function createLayerOrder<TDocument>(
  doc: JSONDocument<TDocument>,
): LayerOrder<TDocument> {
  return {
    canReorder(source, action) {
      return canReorderLayers(doc, source, action);
    },
    reorder(source, action) {
      return reorderLayers(doc, source, action);
    },
    canBringForward(source) {
      return canReorderLayers(doc, source, "bringForward");
    },
    bringForward(source) {
      return reorderLayers(doc, source, "bringForward");
    },
    canBringToFront(source) {
      return canReorderLayers(doc, source, "bringToFront");
    },
    bringToFront(source) {
      return reorderLayers(doc, source, "bringToFront");
    },
    canSendBackward(source) {
      return canReorderLayers(doc, source, "sendBackward");
    },
    sendBackward(source) {
      return reorderLayers(doc, source, "sendBackward");
    },
    canSendToBack(source) {
      return canReorderLayers(doc, source, "sendToBack");
    },
    sendToBack(source) {
      return reorderLayers(doc, source, "sendToBack");
    },
  };
}

export function canReorderLayers<TDocument>(
  doc: JSONDocument<TDocument>,
  source: LayerOrderSource,
  action: LayerOrderAction,
): LayerOrderChangeResult {
  const plan = planLayerOrder(doc, source, action);
  if (!plan.ok) return plan;

  const capability = doc.canPatch(plan.operations);
  if (!capability.ok) return capabilityError("patch_rejected", plan.parent, capability);

  return copyChange(plan);
}

export function reorderLayers<TDocument>(
  doc: JSONDocument<TDocument>,
  source: LayerOrderSource,
  action: LayerOrderAction,
): LayerOrderApplyResult {
  const change = canReorderLayers(doc, source, action);
  if (!change.ok) return change;

  const result = doc.patch(change.operations);
  if (!result.ok) return patchError(change.parent, result);

  return {
    ...change,
    result,
  };
}

function planLayerOrder<TDocument>(
  doc: JSONDocument<TDocument>,
  source: LayerOrderSource,
  action: LayerOrderAction,
): { ok: true } & LayerOrderPlan | LayerOrderError {
  const locations = readLayerLocations(doc, source);
  if (!locations.ok) return locations;

  const parent = locations.locations[0]!.parent;
  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return layerOrderError(
      parentRead.code,
      parentRead.reason ?? `parent not found: ${parent}`,
      parentRead.pointer,
    );
  }
  if (!Array.isArray(parentRead.value)) {
    return layerOrderError("not_layer_item", `parent is not an array: ${parent}`, parent);
  }

  const next = reorderArray(parentRead.value, locations.locations, action);
  if (sameOrder(parentRead.value, next)) {
    return layerOrderError("order_boundary", `layer order is already satisfied for ${action}`, locations.locations[0]!.pointer, {
      parent,
    });
  }

  return {
    ok: true,
    action,
    parent,
    source: locations.locations.map((location) => location.pointer),
    operations: [{ op: "replace", path: parent, value: cloneJson(next) }],
  };
}

function readLayerLocations<TDocument>(
  doc: JSONDocument<TDocument>,
  source: LayerOrderSource,
): { ok: true; locations: ReadonlyArray<LayerItemLocation> } | LayerOrderError {
  const pointers = uniquePointers(Array.isArray(source) ? source : [source]);
  if (pointers.length === 0) {
    return layerOrderError("empty_selection", "layer order source is empty");
  }

  const locations: LayerItemLocation[] = [];
  for (const pointer of pointers) {
    const location = readLayerLocation(doc, pointer);
    if (!location.ok) return location;
    locations.push(location.location);
  }

  const parent = locations[0]!.parent;
  if (locations.some((location) => location.parent !== parent)) {
    return layerOrderError("mixed_parent", "layer order source must share one parent array", parent);
  }

  return {
    ok: true,
    locations: locations.sort((left, right) => left.index - right.index),
  };
}

function readLayerLocation<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
): { ok: true; location: LayerItemLocation } | LayerOrderError {
  if (tryParsePointer(pointer) === null) {
    return layerOrderError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
  }

  const parent = parentPointer(pointer);
  if (parent === null) {
    return layerOrderError("not_layer_item", "root is not a layer item", pointer);
  }

  const index = lastSegmentIndex(pointer);
  if (index === null) {
    return layerOrderError("not_layer_item", `pointer does not address an array item: ${pointer}`, pointer);
  }

  const parentRead = doc.at(parent);
  if (!parentRead.ok) {
    return layerOrderError(parentRead.code, parentRead.reason ?? `parent not found: ${parent}`, parentRead.pointer);
  }
  if (!Array.isArray(parentRead.value)) {
    return layerOrderError("not_layer_item", `parent is not an array: ${parent}`, pointer, {
      parent,
    });
  }
  if (index >= parentRead.value.length) {
    return layerOrderError("path_not_found", `layer item not found: ${pointer}`, pointer, {
      parent,
    });
  }

  return {
    ok: true,
    location: {
      pointer,
      parent,
      index,
    },
  };
}

function reorderArray(
  items: ReadonlyArray<unknown>,
  locations: ReadonlyArray<LayerItemLocation>,
  action: LayerOrderAction,
): ReadonlyArray<unknown> {
  const selected = new Set(locations.map((location) => location.index));
  if (action === "bringToFront") {
    return [
      ...items.filter((_item, index) => !selected.has(index)),
      ...items.filter((_item, index) => selected.has(index)),
    ];
  }
  if (action === "sendToBack") {
    return [
      ...items.filter((_item, index) => selected.has(index)),
      ...items.filter((_item, index) => !selected.has(index)),
    ];
  }

  const next = [...items];
  if (action === "bringForward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(index) && !selected.has(index + 1)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
    return next;
  }

  for (let index = 1; index < next.length; index += 1) {
    if (selected.has(index) && !selected.has(index - 1)) {
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  }
  return next;
}

function sameOrder(
  current: ReadonlyArray<unknown>,
  next: ReadonlyArray<unknown>,
): boolean {
  return current.length === next.length
    && current.every((item, index) => item === next[index]);
}

function uniquePointers(pointers: ReadonlyArray<Pointer>): Pointer[] {
  return [...new Set(pointers)];
}

function copyChange(plan: LayerOrderPlan): LayerOrderChange {
  return {
    ok: true,
    action: plan.action,
    parent: plan.parent,
    source: [...plan.source],
    operations: cloneJson(plan.operations) as JSONPatchOperation[],
  };
}

function capabilityError(
  code: "patch_rejected",
  parent: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): LayerOrderError {
  const error = layerOrderError(code, capability.reason ?? "layer order patch rejected", capability.pointer, {
    parent,
  });
  error.capability = capability;
  return error;
}

function patchError(
  parent: Pointer,
  result: Exclude<JSONResult, { ok: true }>,
): LayerOrderError {
  const error = layerOrderError("patch_failed", result.reason ?? "layer order patch failed", result.pointer, {
    parent,
  });
  error.result = result;
  return error;
}

function layerOrderError(
  code: LayerOrderErrorCode,
  reason: string,
  pointer?: Pointer,
  options: { parent?: Pointer } = {},
): LayerOrderError {
  const error: LayerOrderError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  if (options.parent !== undefined) error.parent = options.parent;
  return error;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
