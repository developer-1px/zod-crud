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

export type OperationResult =
  | {
      ok: true;
      /**
       * Primary node affected by a successful mutation.
       *
       * For create and insert paste this is the inserted subtree root.
       * For overwrite paste and update this is the target root.
       * For delete and cut this is the removed root.
       */
      nodeId?: NodeId;
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
};
