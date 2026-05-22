import * as z from "zod";
import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";

export type OutlineNode = {
  id: string;
  text: string;
  children: OutlineNode[];
};

export type OutlineDocument = {
  title: string;
  nodes: OutlineNode[];
};

export type OutlineRow = {
  pointer: Pointer;
  parentPointer: Pointer;
  index: number;
  depth: number;
  node: OutlineNode;
};

const OutlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    text: z.string(),
    children: z.array(OutlineNodeSchema),
  }),
);

export const OutlineSchema = z.object({
  title: z.string(),
  nodes: z.array(OutlineNodeSchema),
});

export const initialOutline: OutlineDocument = {
  title: "Outliner",
  nodes: [
    {
      id: "n1",
      text: "Plan",
      children: [
        { id: "n2", text: "Draft", children: [] },
        { id: "n3", text: "Review", children: [] },
      ],
    },
    { id: "n4", text: "Ship", children: [] },
  ],
};

export function flattenOutline(nodes: readonly OutlineNode[], parentPointer: Pointer = "/nodes", depth = 0): OutlineRow[] {
  return nodes.flatMap((node, index) => {
    const pointer = `${parentPointer}/${index}` as Pointer;
    return [
      { pointer, parentPointer, index, depth, node },
      ...flattenOutline(node.children, `${pointer}/children` as Pointer, depth + 1),
    ];
  });
}

export function createNode(text = ""): OutlineNode {
  return {
    id: typeof crypto === "undefined" ? `node-${Date.now()}` : crypto.randomUUID(),
    text,
    children: [],
  };
}

export function selectNode(doc: Pick<JSONDocument<OutlineDocument>, "selection">, pointer: Pointer): void {
  doc.selection?.selectRanges([pointer]);
}

export function updateNodeText(doc: JSONDocument<OutlineDocument>, pointer: Pointer, text: string): void {
  doc.commit(
    [{ op: "replace", path: `${pointer}/text`, value: text }],
    { label: "edit text", origin: "toolbar", mergeKey: pointer },
  );
}

export function addChild(doc: JSONDocument<OutlineDocument>, pointer: Pointer): Pointer | null {
  const path = `${pointer}/children/-` as Pointer;
  const child = createNode("New");
  const can = doc.canPatch([{ op: "add", path, value: child }]);
  if (!can.ok) return null;
  doc.commit([{ op: "add", path, value: child }], { label: "add child", origin: "toolbar" });
  const selected = `${pointer}/children/${readNodeArray(doc, `${pointer}/children` as Pointer).length - 1}` as Pointer;
  selectNode(doc, selected);
  return selected;
}

export function addSibling(doc: JSONDocument<OutlineDocument>, row: OutlineRow): Pointer | null {
  const path = `${row.parentPointer}/${row.index + 1}` as Pointer;
  const sibling = createNode("New");
  const can = doc.canPatch([{ op: "add", path, value: sibling }]);
  if (!can.ok) return null;
  doc.commit([{ op: "add", path, value: sibling }], { label: "add sibling", origin: "toolbar" });
  selectNode(doc, path);
  return path;
}

export function duplicateNode(doc: JSONDocument<OutlineDocument>, pointer: Pointer): Pointer | null {
  const result = doc.duplicate(pointer, { rekey: { fields: ["id"], strategy: "suffix" } });
  if (!result.ok) return null;
  const row = findRow(result.value, pointer);
  if (!row) return null;
  const duplicated = `${row.parentPointer}/${row.index + 1}` as Pointer;
  selectNode(doc, duplicated);
  return duplicated;
}

export function copyNode(doc: JSONDocument<OutlineDocument>, pointer: Pointer) {
  return doc.clipboard.copy([pointer]);
}

export function cutNode(doc: JSONDocument<OutlineDocument>, pointer: Pointer) {
  return doc.clipboard.cut([pointer]);
}

export function pasteAfter(doc: JSONDocument<OutlineDocument>, pointer: Pointer): Pointer | null {
  const result = doc.clipboard.paste({ after: pointer }, { rekey: { fields: ["id"], strategy: "suffix" } });
  if (!result.ok) return null;
  const row = findRow(result.value, pointer);
  if (!row) return null;
  const pasted = `${row.parentPointer}/${row.index + 1}` as Pointer;
  selectNode(doc, pasted);
  return pasted;
}

export function moveUp(doc: JSONDocument<OutlineDocument>, row: OutlineRow): Pointer | null {
  if (row.index === 0) return null;
  const to = `${row.parentPointer}/${row.index - 1}` as Pointer;
  return moveNode(doc, row.pointer, to, "move up");
}

export function moveDown(doc: JSONDocument<OutlineDocument>, row: OutlineRow): Pointer | null {
  const siblings = readNodeArray(doc, row.parentPointer);
  if (row.index >= siblings.length - 1) return null;
  const to = `${row.parentPointer}/${row.index + 1}` as Pointer;
  const selected = `${row.parentPointer}/${row.index + 1}` as Pointer;
  const moved = moveNode(doc, row.pointer, to, "move down");
  if (moved) selectNode(doc, selected);
  return moved ? selected : null;
}

export function demote(doc: JSONDocument<OutlineDocument>, row: OutlineRow): Pointer | null {
  if (row.index === 0) return null;
  const previousSibling = `${row.parentPointer}/${row.index - 1}` as Pointer;
  const children = readNodeArray(doc, `${previousSibling}/children` as Pointer);
  const to = `${previousSibling}/children/${children.length}` as Pointer;
  return moveNode(doc, row.pointer, to, "demote");
}

export function promote(doc: JSONDocument<OutlineDocument>, row: OutlineRow): Pointer | null {
  if (row.parentPointer === "/nodes") return null;
  const parentNodePointer = row.parentPointer.replace(/\/children$/, "") as Pointer;
  const parentRow = findRow(doc.value, parentNodePointer);
  if (!parentRow) return null;
  const to = `${parentRow.parentPointer}/${parentRow.index + 1}` as Pointer;
  return moveNode(doc, row.pointer, to, "promote");
}

function moveNode(doc: JSONDocument<OutlineDocument>, from: Pointer, path: Pointer, label: string): Pointer | null {
  const operation: JSONPatchOperation = { op: "move", from, path };
  const can = doc.canPatch([operation]);
  if (!can.ok) return null;
  doc.commit([operation], { label, origin: "toolbar" });
  selectNode(doc, trackMovedPointer(from, path));
  return trackMovedPointer(from, path);
}

function trackMovedPointer(from: Pointer, path: Pointer): Pointer {
  return path.endsWith("/-") ? path.replace(/\/-$/, "") as Pointer : path;
}

export function findRow(value: OutlineDocument, pointer: Pointer): OutlineRow | undefined {
  return flattenOutline(value.nodes).find((row) => row.pointer === pointer);
}

function readNodeArray(doc: JSONDocument<OutlineDocument>, pointer: Pointer): OutlineNode[] {
  const result = doc.at(pointer);
  return result.ok && Array.isArray(result.value) ? result.value as OutlineNode[] : [];
}
