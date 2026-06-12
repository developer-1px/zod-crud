import { type JSONCapabilityResult, type JSONDocument, type JSONPatchOperation, type Pointer, resolveSiblingRange, type SiblingRangeErrorCode } from "@interactive-os/json-document";
import type { LayerItemLocation, LayerOrderAction, LayerOrderChange, LayerOrderChangeResult, LayerOrderError, LayerOrderErrorCode, LayerOrderPlan, LayerOrderSource } from "./types.js";

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

// Selected-sibling-range normalization (dedupe, shared parent, sort) is shared
// core (RFC #87). Layer order does not require contiguity. Bounds reads stay
// local; layer items carry no value.
const LAYER_ERROR_CODE: Record<SiblingRangeErrorCode, LayerOrderErrorCode> = {
  empty_selection: "empty_selection",
  invalid_pointer: "invalid_pointer",
  not_array_item: "not_layer_item",
  mixed_parent: "mixed_parent",
  non_contiguous: "mixed_parent",
};

function readLayerLocations<TDocument>(
  doc: JSONDocument<TDocument>,
  source: LayerOrderSource,
): { ok: true; locations: ReadonlyArray<LayerItemLocation> } | LayerOrderError {
  const range = resolveSiblingRange(Array.isArray(source) ? source : [source], { dedupe: true });
  if (!range.ok) return layerOrderError(LAYER_ERROR_CODE[range.code], range.reason, range.pointer);

  const parentRead = doc.at(range.parent);
  if (!parentRead.ok) {
    return layerOrderError(parentRead.code, parentRead.reason ?? `parent not found: ${range.parent}`, parentRead.pointer);
  }
  if (!Array.isArray(parentRead.value)) {
    return layerOrderError("not_layer_item", `parent is not an array: ${range.parent}`, range.parent, { parent: range.parent });
  }

  const items = parentRead.value;
  const locations: LayerItemLocation[] = [];
  for (const location of range.locations) {
    if (location.index >= items.length) {
      return layerOrderError("path_not_found", `layer item not found: ${location.pointer}`, location.pointer, { parent: range.parent });
    }
    locations.push({ pointer: location.pointer, parent: location.parent, index: location.index });
  }

  return { ok: true, locations };
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

export function layerOrderError(
  code: LayerOrderErrorCode,
  reason: string,
  pointer?: Pointer,
  options: { parent?: Pointer } = {},
): LayerOrderError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }), ...(options.parent === undefined ? {} : { parent: options.parent }) };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
