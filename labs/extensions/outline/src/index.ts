import type {
  EntryKind,
  JSONDocument,
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

export interface OutlineOptions {
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

interface NormalizedOptions {
  maxDepth: number;
  includeValues: boolean;
}

type BuildNodeResult =
  | { ok: true; node: OutlineNode }
  | OutlineError;

export function createOutline<T>(
  doc: JSONDocument<T>,
  rootPointer: Pointer = "",
  options: OutlineOptions = {},
): OutlineResult {
  const built = buildNode(doc, rootPointer, "", 0, normalizeOptions(options));
  if (!built.ok) return built;

  const nodes: OutlineNode[] = [];
  collectNodes(built.node, nodes);

  return {
    ok: true,
    root: copyNode(built.node),
    nodes: copyNodes(nodes),
  };
}

function buildNode<T>(
  doc: JSONDocument<T>,
  pointer: Pointer,
  key: string,
  depth: number,
  options: NormalizedOptions,
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

function outlineNode(input: {
  key: string;
  pointer: Pointer;
  depth: number;
  entryKind: EntryKind;
  schemaKind: SchemaKind;
  childCount: number;
  value: unknown;
  options: NormalizedOptions;
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

function normalizeOptions(options: OutlineOptions): NormalizedOptions {
  return {
    maxDepth: normalizeMaxDepth(options.maxDepth),
    includeValues: options.includeValues === true,
  };
}

function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(maxDepth)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(maxDepth));
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

function cloneJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}
