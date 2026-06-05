import type {
  EntryKind,
  JSONCapabilityResult,
  JSONPatchOperation,
  JSONResult,
  Pointer,
  SchemaKind,
} from "zod-crud";

export type OutlineErrorCode =
  | "invalid_pointer"
  | "path_not_found";

export interface OutlineError {
  ok: false;
  code: OutlineErrorCode;
  reason?: string;
  pointer: Pointer;
}

export interface OutlineTreeOptions {
  maxDepth?: number;
  includeValues?: boolean;
}

export interface OutlineNode {
  key: string;
  path: Pointer;
  depth: number;
  entryKind: EntryKind;
  schemaKind: SchemaKind;
  childCount: number;
  expandable: boolean;
  value?: unknown;
  children?: ReadonlyArray<OutlineNode>;
}

export type OutlineResult =
  | {
    ok: true;
    root: OutlineNode;
    nodes: ReadonlyArray<OutlineNode>;
  }
  | OutlineError;

export interface OutlineStructureOptions {
  childrenKey?: string;
}

export type OutlineSource = Pointer | ReadonlyArray<Pointer>;

export type OutlineEditErrorCode =
  | "empty_selection"
  | "invalid_pointer"
  | "path_not_found"
  | "not_outline_item"
  | "patch_rejected"
  | "patch_failed";

export interface OutlineEditError {
  ok: false;
  code: OutlineEditErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface OutlineEditChange {
  ok: true;
  operation: "demote" | "promote";
  source: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type OutlineEditChangeResult =
  | OutlineEditChange
  | OutlineEditError;

export type OutlineEditResult =
  | (OutlineEditChange & { result: JSONResult })
  | OutlineEditError;

export interface Outline<TDocument> {
  tree(rootPointer?: Pointer, options?: OutlineTreeOptions): OutlineResult;
  canDemote(source: OutlineSource): OutlineEditChangeResult;
  demote(source: OutlineSource): OutlineEditResult;
  canPromote(source: OutlineSource): OutlineEditChangeResult;
  promote(source: OutlineSource): OutlineEditResult;
}

export interface NormalizedTreeOptions {
  maxDepth: number;
  includeValues: boolean;
}

export interface NormalizedStructureOptions {
  childrenKey: string;
}

export type BuildNodeResult =
  | { ok: true; node: OutlineNode }
  | OutlineError;

export interface OutlineItemLocation {
  pointer: Pointer;
  parentArray: Pointer;
  index: number;
}
