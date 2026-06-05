import type { JSONCapabilityResult, JSONPatchOperation, JSONResult, Pointer } from "zod-crud";

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

export interface LayerItemLocation {
  pointer: Pointer;
  parent: Pointer;
  index: number;
}

export interface LayerOrderPlan {
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
