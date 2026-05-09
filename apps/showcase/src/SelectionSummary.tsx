import type {
  JsonNode,
  NodeId,
} from "zod-crud";

import { stringify } from "./playground-helpers.js";

export function SelectionSummary({
  selectedIds,
  selectedNode,
  selectedPath,
}: {
  selectedIds: NodeId[];
  selectedNode: JsonNode | undefined;
  selectedPath: string;
}) {
  return (
    <pre className="mini-json">{stringify({
      activeId: selectedNode?.id ?? null,
      path: selectedPath,
      type: selectedNode?.type ?? "missing",
      key: selectedNode?.key ?? null,
      selectedIds,
    })}</pre>
  );
}
