import type { JsonDoc, JsonNode, JsonPath, NodeId } from "../document/json-doc-types.js";
import { walk } from "./walk.js";

export type NodePredicate = (node: JsonNode, path: JsonPath) => boolean;

export function findAll(doc: JsonDoc, predicate: NodePredicate): NodeId[] {
  const results: NodeId[] = [];
  walk(doc, (node, path) => {
    if (predicate(node, path)) results.push(node.id);
  });
  return results;
}
