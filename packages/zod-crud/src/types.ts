import type { ZodError } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type NodeId = string;
export type JsonKey = string | number | null;
export type JsonNodeType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

export type JsonNode = {
  id: NodeId;
  type: JsonNodeType;
  parentId: NodeId | null;
  key: JsonKey;
  children: NodeId[];
  value?: JsonPrimitive;
};

export type JsonDoc = {
  rootId: NodeId;
  nodes: Record<NodeId, JsonNode>;
};

export type JsonPath = Array<string | number>;

export type FocusFilter = (doc: JsonDoc, candidateId: NodeId) => boolean;

export type DefaultValueFactory = (parentPath: JsonPath) => JsonValue;

export type JsonChange =
  | {
      type: "insert";
      nodeId: NodeId;
      after: JsonNode;
    }
  | {
      type: "update";
      nodeId: NodeId;
      before: JsonNode;
      after: JsonNode;
    }
  | {
      type: "delete";
      nodeId: NodeId;
      before: JsonNode;
    };

export type OperationResult =
  | {
      ok: true;
      /**
       * Primary node affected by a successful mutation.
       *
       * For create and insert paste this is the inserted subtree root.
       * For overwrite paste and update this is the target root.
       * For delete and cut this is the removed root.
       * For deleteMany this is the removed sibling used as the history focus
       * anchor.
       */
      nodeId?: NodeId;
      /**
       * Existing node that editor UIs should focus after the mutation.
       *
       * This is always a live node in the committed document.
       * For multi-value paste this is the last inserted root, while
       * `focusNodeIds` contains the whole pasted selection.
       */
      focusNodeId?: NodeId;
      /**
       * Existing nodes that editor UIs should select after a batch mutation.
       *
       * This is used when a single committed operation creates or restores
       * multiple peer roots, such as multi-value paste.
       */
      focusNodeIds?: NodeId[];
      /**
       * Changed JsonDoc nodes for this successful mutation.
       *
       * This contains only inserted, updated, and deleted nodes, not a full
       * document snapshot.
       */
      changes?: JsonChange[];
    }
  | {
      ok: false;
      reason: string;
      error?: ZodError;
    };

export type PasteMode = "auto" | "child" | "overwrite";

export type PasteOptions = {
  mode?: PasteMode;
  childKeys?: string[];
  index?: number;
};

export type JsonCrudOptions = {
  childKeys?: string[];
  focusFilter?: FocusFilter;
  defaultFor?: DefaultValueFactory;
};
