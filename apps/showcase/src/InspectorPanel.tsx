import type {
  JsonChange,
  JsonDoc,
  JsonNode,
  JsonValue,
  NodeId,
  OperationResult,
} from "zod-crud";

import type { EntityDefinition } from "./entities.js";
import {
  changeLabel,
  pathString,
  valueLabel,
} from "./grid-rows.js";
import { PanelTitle } from "./PanelTitle.js";

export type CommandLog = {
  command: string;
  target: string;
  result: OperationResult;
};

export function InspectorPanel({
  activeEntity,
  clipboardValue,
  doc,
  jsonValue,
  lastChanges,
  lastCommand,
  safeSelectedId,
  selectedIds,
  selectedNode,
}: {
  activeEntity: EntityDefinition;
  clipboardValue: JsonValue | JsonValue[] | null;
  doc: JsonDoc;
  jsonValue: JsonValue;
  lastChanges: JsonChange[];
  lastCommand: CommandLog;
  safeSelectedId: NodeId;
  selectedIds: Set<NodeId>;
  selectedNode: JsonNode | undefined;
}) {
  return (
    <aside className="panel detail-panel">
      <PanelTitle title="Command result" detail={lastCommand.command} />
      <dl className="result-list">
        <div>
          <dt>target</dt>
          <dd>{lastCommand.target}</dd>
        </div>
        <div>
          <dt>ok</dt>
          <dd className={lastCommand.result.ok ? "ok" : "error"}>{String(lastCommand.result.ok)}</dd>
        </div>
        <div>
          <dt>reason</dt>
          <dd>{lastCommand.result.ok ? "none" : lastCommand.result.reason}</dd>
        </div>
        <div>
          <dt>nodeId</dt>
          <dd>{lastCommand.result.ok ? lastCommand.result.nodeId ?? "none" : "none"}</dd>
        </div>
        <div>
          <dt>focusNodeId</dt>
          <dd>{lastCommand.result.ok ? lastCommand.result.focusNodeId ?? "none" : "none"}</dd>
        </div>
        <div>
          <dt>focusNodeIds</dt>
          <dd>{lastCommand.result.ok ? nodeIdList(lastCommand.result.focusNodeIds) : "none"}</dd>
        </div>
        <div>
          <dt>changes</dt>
          <dd>{lastChanges.length}</dd>
        </div>
        <div>
          <dt>clipboard</dt>
          <dd>{clipboardValue === null ? "empty" : valueLabel(clipboardValue)}</dd>
        </div>
      </dl>

      <PanelTitle title="Changed nodes" detail={`${lastChanges.length}`} />
      {lastChanges.length === 0 ? (
        <p className="empty-state">none</p>
      ) : (
        <ol className="change-list">
          {lastChanges.map((change) => (
            <li key={`${change.type}-${change.nodeId}`} className="change-row">
              <span className={`change-type ${change.type}`}>{change.type}</span>
              <span>{change.nodeId}</span>
              <small>{changeLabel(change)}</small>
            </li>
          ))}
        </ol>
      )}

      <PanelTitle title="Selected node" detail={safeSelectedId} />
      <dl className="result-list">
        <div>
          <dt>activeId</dt>
          <dd>{safeSelectedId}</dd>
        </div>
        <div>
          <dt>selectedIds</dt>
          <dd>{nodeIdList([...selectedIds])}</dd>
        </div>
        <div>
          <dt>Path</dt>
          <dd>{selectedNode === undefined ? "/" : pathString(doc, safeSelectedId)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{selectedNode?.type ?? "none"}</dd>
        </div>
        <div>
          <dt>Children</dt>
          <dd>{selectedNode?.children.length ?? 0}</dd>
        </div>
      </dl>

      <PanelTitle title="JSON output" />
      <pre className="json-output">{JSON.stringify(jsonValue, null, 2)}</pre>

      <PanelTitle title="Zod entity" detail={activeEntity.schemaName} />
      <dl className="result-list">
        <div>
          <dt>Entity</dt>
          <dd>{activeEntity.label}</dd>
        </div>
        <div>
          <dt>Child keys</dt>
          <dd>{activeEntity.childKeys.join(", ")}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{activeEntity.description}</dd>
        </div>
      </dl>
      <pre className="schema-output">{activeEntity.schemaSource}</pre>
    </aside>
  );
}

function nodeIdList(nodeIds: NodeId[] | undefined): string {
  if (nodeIds === undefined || nodeIds.length === 0) {
    return "none";
  }

  return `[${nodeIds.join(", ")}]`;
}
