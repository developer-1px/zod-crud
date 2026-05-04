import type {
  JsonDoc,
  JsonValue,
  NodeId,
  OperationResult,
} from "zod-crud";

import { pathString } from "./grid-rows.js";
import { PanelTitle } from "./PanelTitle.js";

export type CommandLog = {
  command: string;
  result: OperationResult;
};

export function InspectorPanel({
  doc,
  jsonValue,
  lastCommand,
  safeSelectedId,
  selectedIds,
}: {
  doc: JsonDoc;
  jsonValue: JsonValue;
  lastCommand: CommandLog;
  safeSelectedId: NodeId;
  selectedIds: Set<NodeId>;
}) {
  const selectedNode = doc.nodes[safeSelectedId];

  return (
    <aside className="panel">
      <PanelTitle title="Command result" detail={lastCommand.command} />
      <pre className="json-output">{JSON.stringify(lastCommand.result, null, 2)}</pre>

      <PanelTitle title="Selected node" detail={safeSelectedId} />
      <pre className="json-output">{JSON.stringify({
        activeId: safeSelectedId,
        selectedIds: [...selectedIds],
        path: selectedNode === undefined ? "/" : pathString(doc, safeSelectedId),
        type: selectedNode?.type ?? "none",
        children: selectedNode?.children.length ?? 0,
      }, null, 2)}</pre>

      <PanelTitle title="JSON output" />
      <pre className="json-output">{JSON.stringify(jsonValue, null, 2)}</pre>
    </aside>
  );
}
