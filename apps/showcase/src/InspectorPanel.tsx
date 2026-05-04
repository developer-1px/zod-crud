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
} from "./grid-rows.js";
import { PanelTitle } from "./PanelTitle.js";

export type CommandLog = {
  command: string;
  result: OperationResult;
};

export function InspectorPanel({
  activeEntity,
  doc,
  jsonValue,
  lastChanges,
  lastCommand,
  safeSelectedId,
  selectedIds,
  selectedNode,
}: {
  activeEntity: EntityDefinition;
  doc: JsonDoc;
  jsonValue: JsonValue;
  lastChanges: JsonChange[];
  lastCommand: CommandLog;
  safeSelectedId: NodeId;
  selectedIds: Set<NodeId>;
  selectedNode: JsonNode | undefined;
}) {
  return (
    <aside className="panel">
      <PanelTitle title="Command result" detail={lastCommand.command} />
      <pre className="json-output">{JSON.stringify(lastCommand.result, null, 2)}</pre>

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
          <dd>{[...selectedIds].join(", ") || "none"}</dd>
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
      </dl>
      <pre className="schema-output">{activeEntity.schemaSource}</pre>
    </aside>
  );
}
