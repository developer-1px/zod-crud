import {
  appendSegment,
  lastSegmentIndex,
  parentPointer,
  parsePointer,
  trackPointer,
  tryParsePointer,
  withLastSegment,
  type EntryKind,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type SchemaKind,
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

interface NormalizedTreeOptions {
  maxDepth: number;
  includeValues: boolean;
}

interface NormalizedStructureOptions {
  childrenKey: string;
}

type BuildNodeResult =
  | { ok: true; node: OutlineNode }
  | OutlineError;

interface OutlineItemLocation {
  pointer: Pointer;
  parentArray: Pointer;
  index: number;
}

export function createOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  options: OutlineStructureOptions = {},
): Outline<TDocument> {
  const structureOptions = normalizeStructureOptions(options);

  return {
    tree(rootPointer = "", treeOptions = {}) {
      return readOutline(doc, rootPointer, treeOptions);
    },
    canDemote(source) {
      return canDemoteOutline(doc, source, structureOptions);
    },
    demote(source) {
      return demoteOutline(doc, source, structureOptions);
    },
    canPromote(source) {
      return canPromoteOutline(doc, source, structureOptions);
    },
    promote(source) {
      return promoteOutline(doc, source, structureOptions);
    },
  };
}

export function readOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  rootPointer: Pointer = "",
  options: OutlineTreeOptions = {},
): OutlineResult {
  const built = buildNode(doc, rootPointer, "", 0, normalizeTreeOptions(options));
  if (!built.ok) return built;

  const nodes: OutlineNode[] = [];
  collectNodes(built.node, nodes);

  return {
    ok: true,
    root: copyNode(built.node),
    nodes: copyNodes(nodes),
  };
}

export function canDemoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditChangeResult {
  const plan = planDemote(doc, source, normalizeStructureOptions(options));
  if (!plan.ok) return plan;
  return changeWithCapability(doc, plan);
}

export function demoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditResult {
  const change = canDemoteOutline(doc, source, options);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

export function canPromoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditChangeResult {
  const plan = planPromote(doc, source, normalizeStructureOptions(options));
  if (!plan.ok) return plan;
  return changeWithCapability(doc, plan);
}

export function promoteOutline<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: OutlineStructureOptions = {},
): OutlineEditResult {
  const change = canPromoteOutline(doc, source, options);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

function buildNode<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  key: string,
  depth: number,
  options: NormalizedTreeOptions,
): BuildNodeResult {
  const read = doc.at(pointer);
  if (!read.ok) return outlineError(read.code, read.pointer, read.reason);

  const entries = doc.entries(pointer);
  if (!entries.ok) return outlineError(entries.code, entries.pointer, entries.reason);

  const schema = doc.schema.kind(pointer);
  const node = outlineNode({
    key,
    pointer: read.path,
    depth,
    entryKind: entries.kind,
    schemaKind: schema.ok ? schema.kind : "unknown",
    childCount: entries.entries.length,
    value: read.value,
    options,
  });

  if (entries.entries.length > 0 && depth < options.maxDepth) {
    const children: OutlineNode[] = [];
    for (const entry of entries.entries) {
      const child = buildNode(doc, entry.path, entry.key, depth + 1, options);
      if (!child.ok) return child;
      children.push(child.node);
    }
    node.children = children;
  }

  return { ok: true, node };
}

function planDemote<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: NormalizedStructureOptions,
): OutlineEditChangeResult {
  const pointers = normalizeSource(source);
  if (!pointers.ok) return pointers;

  const checked = validateSources(doc, pointers.pointers, options);
  if (!checked.ok) return checked;

  const operations: JSONPatchOperation[] = [];
  for (const original of checked.pointers) {
    const current = trackPointer(original, operations);
    if (current === null) continue;

    const location = outlineItemLocation(current, options);
    if (!location.ok) return location;
    if (location.index === 0) {
      return editError("path_not_found", "no previous sibling for outline item", current);
    }

    const previousSibling = withLastSegment(current, location.index - 1);
    if (previousSibling === null) {
      return editError("path_not_found", "no previous sibling for outline item", current);
    }

    operations.push({
      op: "move",
      from: current,
      path: appendSegment(appendSegment(previousSibling, options.childrenKey), "-"),
    });
  }

  return {
    ok: true,
    operation: "demote",
    source: checked.pointers,
    operations,
  };
}

function planPromote<TDocument>(
  doc: JSONDocument<TDocument>,
  source: OutlineSource,
  options: NormalizedStructureOptions,
): OutlineEditChangeResult {
  const pointers = normalizeSource(source);
  if (!pointers.ok) return pointers;

  const checked = validateSources(doc, pointers.pointers, options);
  if (!checked.ok) return checked;

  const operations: JSONPatchOperation[] = [];
  const selected = new Set<Pointer>(checked.pointers);
  const promotedAfterOwner = new Map<Pointer, number>();
  for (const original of checked.pointers) {
    const originalLocation = outlineItemLocation(original, options);
    if (!originalLocation.ok) return originalLocation;

    const originalOwner = parentPointer(originalLocation.parentArray);
    if (originalOwner === null || originalOwner === "") {
      return editError("path_not_found", "outline item is already top-level", original);
    }

    const current = trackPointer(original, operations);
    if (current === null) continue;

    const location = outlineItemLocation(current, options);
    if (!location.ok) return location;

    const owner = parentPointer(location.parentArray);
    if (owner === null || owner === "") {
      return editError("path_not_found", "outline item is already top-level", current);
    }

    const ownerLocation = outlineItemLocation(owner, options);
    if (!ownerLocation.ok) return ownerLocation;

    const ownerParent = ownerLocation.parentArray;
    const previousPromoted = promotedAfterOwner.get(originalOwner) ?? 0;
    const promotedPath = appendSegment(ownerParent, ownerLocation.index + 1 + previousPromoted);
    operations.push({ op: "move", from: current, path: promotedPath });
    promotedAfterOwner.set(originalOwner, previousPromoted + 1);

    const trailCount = trailingUnselectedSiblingCount(doc, originalLocation, selected);
    if (!trailCount.ok) return trailCount;

    for (let index = 0; index < trailCount.count; index += 1) {
      operations.push({
        op: "move",
        from: appendSegment(location.parentArray, location.index),
        path: appendSegment(appendSegment(promotedPath, options.childrenKey), "-"),
      });
    }
  }

  return {
    ok: true,
    operation: "promote",
    source: checked.pointers,
    operations,
  };
}

function validateSources<TDocument>(
  doc: JSONDocument<TDocument>,
  pointers: ReadonlyArray<Pointer>,
  options: NormalizedStructureOptions,
): { ok: true; pointers: ReadonlyArray<Pointer> } | OutlineEditError {
  for (const pointer of pointers) {
    const location = outlineItemLocation(pointer, options);
    if (!location.ok) return location;

    const read = doc.at(pointer);
    if (!read.ok) return editError(read.code, read.reason ?? `path not found: ${pointer}`, read.pointer);

    const parent = doc.at(location.parentArray);
    if (!parent.ok) return editError(parent.code, parent.reason ?? `parent not found: ${location.parentArray}`, parent.pointer);
    if (!Array.isArray(parent.value)) {
      return editError("not_outline_item", `parent is not an array: ${location.parentArray}`, pointer);
    }
  }
  return { ok: true, pointers };
}

function normalizeSource(source: OutlineSource): { ok: true; pointers: ReadonlyArray<Pointer> } | OutlineEditError {
  const inputs = typeof source === "string" ? [source] : [...source];
  const pointers: Pointer[] = [];
  for (const pointer of inputs) {
    if (tryParsePointer(pointer) === null) {
      return editError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
    }
    if (!pointers.includes(pointer)) pointers.push(pointer);
  }

  if (pointers.length === 0) return editError("empty_selection", "outline source is empty");
  return {
    ok: true,
    pointers: pointers.sort(compareOutlinePointers),
  };
}

function outlineItemLocation(
  pointer: Pointer,
  options: NormalizedStructureOptions,
): { ok: true; pointer: Pointer; parentArray: Pointer; index: number } | OutlineEditError {
  if (pointer === "") return editError("not_outline_item", "root is not an outline item", pointer);
  const parsed = tryParsePointer(pointer);
  if (parsed === null) return editError("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);

  const index = lastSegmentIndex(pointer);
  const parentArray = parentPointer(pointer);
  if (index === null || parentArray === null || lastPointerSegment(parentArray) !== options.childrenKey) {
    return editError("not_outline_item", `pointer does not address an outline item: ${pointer}`, pointer);
  }
  return { ok: true, pointer, parentArray, index };
}

function trailingUnselectedSiblingCount<TDocument>(
  doc: JSONDocument<TDocument>,
  location: OutlineItemLocation,
  selected: ReadonlySet<Pointer>,
): { ok: true; count: number } | OutlineEditError {
  const read = doc.at(location.parentArray);
  if (!read.ok) return editError(read.code, read.reason ?? `parent not found: ${location.parentArray}`, read.pointer);
  if (!Array.isArray(read.value)) {
    return editError("not_outline_item", `parent is not an array: ${location.parentArray}`, location.pointer);
  }
  if (selected.size <= 1) {
    return { ok: true, count: Math.max(0, read.value.length - location.index - 1) };
  }

  let count = 0;
  for (let index = location.index + 1; index < read.value.length; index += 1) {
    const pointer = appendSegment(location.parentArray, index);
    if (selected.has(pointer)) break;
    count += 1;
  }
  return { ok: true, count };
}

function changeWithCapability<TDocument>(
  doc: JSONDocument<TDocument>,
  change: OutlineEditChange,
): OutlineEditChangeResult {
  if (change.operations.length > 0) {
    const capability = doc.canPatch(change.operations);
    if (!capability.ok) {
      return capabilityError(capability);
    }
  }
  return copyChange(change);
}

function applyChange<TDocument>(
  doc: JSONDocument<TDocument>,
  change: OutlineEditChange,
): OutlineEditResult {
  const result: JSONResult = change.operations.length === 0
    ? { ok: true }
    : doc.patch(change.operations);
  if (!result.ok) return patchError(result);

  return {
    ...copyChange(change),
    result,
  };
}

function outlineNode(input: {
  key: string;
  pointer: Pointer;
  depth: number;
  entryKind: EntryKind;
  schemaKind: SchemaKind;
  childCount: number;
  value: unknown;
  options: NormalizedTreeOptions;
}): OutlineNode {
  const node: OutlineNode = {
    key: input.key,
    path: input.pointer,
    depth: input.depth,
    entryKind: input.entryKind,
    schemaKind: input.schemaKind,
    childCount: input.childCount,
    expandable: input.childCount > 0,
  };
  if (input.options.includeValues) node.value = cloneJson(input.value);
  return node;
}

function collectNodes(
  node: OutlineNode,
  nodes: OutlineNode[],
): void {
  nodes.push(node);
  for (const child of node.children ?? []) {
    collectNodes(child, nodes);
  }
}

function copyNodes(nodes: ReadonlyArray<OutlineNode>): ReadonlyArray<OutlineNode> {
  return nodes.map(copyNode);
}

function copyNode(node: OutlineNode): OutlineNode {
  const copied: OutlineNode = {
    key: node.key,
    path: node.path,
    depth: node.depth,
    entryKind: node.entryKind,
    schemaKind: node.schemaKind,
    childCount: node.childCount,
    expandable: node.expandable,
  };
  if ("value" in node) copied.value = cloneJson(node.value);
  if (node.children !== undefined) copied.children = copyNodes(node.children);
  return copied;
}

function normalizeTreeOptions(options: OutlineTreeOptions): NormalizedTreeOptions {
  const maxDepth = options.maxDepth;
  return {
    maxDepth: maxDepth === undefined || !Number.isFinite(maxDepth)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(maxDepth)),
    includeValues: options.includeValues === true,
  };
}

function normalizeStructureOptions(options: OutlineStructureOptions): NormalizedStructureOptions {
  return {
    childrenKey: options.childrenKey ?? "children",
  };
}

function outlineError(
  code: OutlineErrorCode,
  pointer: Pointer,
  reason?: string,
): OutlineError {
  const error: OutlineError = { ok: false, code, pointer };
  if (reason !== undefined) error.reason = reason;
  return error;
}

function editError(
  code: OutlineEditErrorCode,
  reason: string,
  pointer?: Pointer,
): OutlineEditError {
  const error: OutlineEditError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}

function capabilityError(
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): OutlineEditError {
  const error = editError("patch_rejected", capability.reason ?? "outline patch rejected", capability.pointer);
  error.capability = capability;
  return error;
}

function patchError(result: Exclude<JSONResult, { ok: true }>): OutlineEditError {
  const error = editError("patch_failed", result.reason ?? "outline patch failed", result.pointer);
  error.result = result;
  return error;
}

function copyChange(change: OutlineEditChange): OutlineEditChange {
  return {
    ok: true,
    operation: change.operation,
    source: [...change.source],
    operations: cloneJson(change.operations) as JSONPatchOperation[],
  };
}

function lastPointerSegment(pointer: Pointer): string | null {
  const segments = tryParsePointer(pointer);
  if (segments === null || segments.length === 0) return null;
  return segments[segments.length - 1] ?? null;
}

function compareOutlinePointers(left: Pointer, right: Pointer): number {
  const leftSegments = parsePointer(left);
  const rightSegments = parsePointer(right);
  const length = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    const leftSegment = leftSegments[index]!;
    const rightSegment = rightSegments[index]!;
    if (leftSegment === rightSegment) continue;

    const leftNumber = decimalSegment(leftSegment);
    const rightNumber = decimalSegment(rightSegment);
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
    return leftSegment.localeCompare(rightSegment);
  }
  return leftSegments.length - rightSegments.length;
}

function decimalSegment(segment: string): number | null {
  if (segment === "0") return 0;
  if (!/^[1-9][0-9]*$/.test(segment)) return null;
  return Number(segment);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
