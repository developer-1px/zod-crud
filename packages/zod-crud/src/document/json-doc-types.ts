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
