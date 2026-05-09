import type { JsonDoc, JsonPath, NodeId } from "../document/json-doc-types.js";

export type WalkVisitor = (node: import("../document/json-doc-types.js").JsonNode, path: JsonPath) => void | "skip" | "stop";

export function walk(doc: JsonDoc, visit: WalkVisitor): void {
  const visitNode = (nodeId: NodeId, path: JsonPath): boolean => {
    const node = doc.nodes[nodeId];
    if (node === undefined) return true;
    const result = visit(node, path);
    if (result === "stop") return false;
    if (result === "skip") return true;
    for (const childId of node.children) {
      const child = doc.nodes[childId];
      if (child === undefined) continue;
      const childPath: JsonPath = child.key === null ? path : [...path, child.key];
      if (!visitNode(childId, childPath)) return false;
    }
    return true;
  };
  visitNode(doc.rootId, []);
}
