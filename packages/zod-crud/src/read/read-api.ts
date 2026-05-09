import type * as z from "zod";

import type {
  JsonDoc,
  JsonKey,
  JsonPath,
  JsonValue,
  NodeId,
} from "../types.js";
import type { NodePredicate, WalkVisitor } from "../json-crud.js";
import { findChildByKey, getPath } from "../document/json-doc-access.js";
import { cloneDoc, cloneJson } from "../document/json-doc-clone.js";
import { deserialize } from "../document/json-doc-serialization.js";
import { walk as walkDoc } from "./walk.js";
import { findAll as findAllDoc } from "./find-all.js";

export type ReadApi<T extends JsonValue> = {
  snapshot: () => JsonDoc;
  toJson: () => T;
  read: (nodeId?: NodeId) => JsonValue;
  pathOf: (nodeId: NodeId) => JsonPath;
  find: (parentId: NodeId, key: JsonKey) => NodeId | null;
  findAll: (predicate: NodePredicate) => NodeId[];
  walk: (visit: WalkVisitor) => void;
};

export function createReadApi<T extends JsonValue>(deps: {
  schema: z.ZodType<T, any>;
  getDoc: () => JsonDoc;
}): ReadApi<T> {
  const { schema, getDoc } = deps;
  return {
    snapshot: () => cloneDoc(getDoc()),
    toJson: () => schema.parse(deserialize(getDoc())),
    read: (nodeId?: NodeId) => {
      const doc = getDoc();
      return cloneJson(deserialize(doc, nodeId ?? doc.rootId));
    },
    pathOf: (nodeId: NodeId) => getPath(getDoc(), nodeId),
    find: (parentId: NodeId, key: JsonKey) =>
      findChildByKey(getDoc(), parentId, key)?.id ?? null,
    findAll: (predicate: NodePredicate) => findAllDoc(getDoc(), predicate),
    walk: (visit: WalkVisitor) => walkDoc(getDoc(), visit),
  };
}
