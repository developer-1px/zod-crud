import type {
  EntryKind,
  JSONDocument,
  Pointer,
  SchemaKind,
} from "@interactive-os/json-document";

import {
  copyNode,
  copyNodes,
  cloneJson,
} from "./copy.js";
import {
  outlineError,
} from "./error.js";
import {
  normalizeTreeOptions,
} from "./options.js";
import type {
  BuildNodeResult,
  NormalizedTreeOptions,
  OutlineNode,
  OutlineResult,
  OutlineTreeOptions,
} from "./types.js";

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
