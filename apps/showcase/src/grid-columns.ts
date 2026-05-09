import type {
  JsonNode,
  NodeId,
} from "zod-crud";

export type GridColumn = {
  id: "path" | "key" | "type" | "value";
  label: string;
};

export type GridRow = {
  id: NodeId;
  depth: number;
  keyLabel: string;
  path: string;
  type: JsonNode["type"];
  value: string;
  expandable: boolean;
  expanded: boolean;
};

export const columns: GridColumn[] = [
  { id: "path", label: "Path" },
  { id: "key", label: "Key" },
  { id: "type", label: "Type" },
  { id: "value", label: "Value" },
];
