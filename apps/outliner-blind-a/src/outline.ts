import type { OutlineDoc, OutlineNode } from "./schema";

export type FlatNode = {
  node: OutlineNode;
  pointer: string;
  parentArrayPointer: string;
  index: number;
  depth: number;
};

export function flattenOutline(value: OutlineDoc): FlatNode[] {
  const rows: FlatNode[] = [];

  function visit(nodes: OutlineNode[], parentArrayPointer: string, depth: number) {
    nodes.forEach((node, index) => {
      const pointer = `${parentArrayPointer}/${index}`;
      rows.push({ node, pointer, parentArrayPointer, index, depth });
      visit(node.children, `${pointer}/children`, depth + 1);
    });
  }

  visit(value.nodes, "/nodes", 0);
  return rows;
}

export function createNode(text = ""): OutlineNode {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return { id, text, children: [] };
}

export function parentNodePointer(parentArrayPointer: string): string | null {
  return parentArrayPointer.endsWith("/children")
    ? parentArrayPointer.slice(0, -"/children".length)
    : null;
}

export function arrayPointerOf(nodePointer: string): string {
  return nodePointer.slice(0, nodePointer.lastIndexOf("/"));
}

export function indexOf(nodePointer: string): number {
  return Number(nodePointer.slice(nodePointer.lastIndexOf("/") + 1));
}
