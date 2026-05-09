import type {
  JsonNode,
  NodeId,
} from "zod-crud";

export type ProjectionColumn = {
  id: "path" | "key" | "type" | "value";
  label: string;
};

export type ProjectionRow = {
  id: NodeId;
  depth: number;
  keyLabel: string;
  path: string;
  type: JsonNode["type"];
  value: string;
  expandable: boolean;
  expanded: boolean;
};

export const projectionColumns: ProjectionColumn[] = [
  { id: "path", label: "Path" },
  { id: "key", label: "Key" },
  { id: "type", label: "Type" },
  { id: "value", label: "Value" },
];
