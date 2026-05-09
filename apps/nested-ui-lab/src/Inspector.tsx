import type { JsonDoc, JsonNode, NodeId } from "zod-crud";

import type { CommandLog } from "./CommandLog.js";
import {
  canRenameNode,
  canUpdateNode,
} from "./projections.js";

export function Inspector({
  doc,
  keyDraft,
  lastCommand,
  selectedId,
  selectedNode,
  valueDraft,
  onKeyDraft,
  onRename,
  onUpdate,
  onValueDraft,
}: {
  doc: JsonDoc;
  keyDraft: string;
  lastCommand: CommandLog;
  selectedId: NodeId;
  selectedNode: JsonNode | undefined;
  valueDraft: string;
  onKeyDraft: (value: string) => void;
  onRename: () => void;
  onUpdate: () => void;
  onValueDraft: (value: string) => void;
}) {
  return (
    <div className="inspector">
      <dl className="node-facts">
        <div><dt>ID</dt><dd>{selectedId}</dd></div>
        <div><dt>Type</dt><dd>{selectedNode?.type ?? "missing"}</dd></div>
        <div><dt>Children</dt><dd>{selectedNode?.children.length ?? 0}</dd></div>
      </dl>

      <label>
        <span>Key</span>
        <input value={keyDraft} disabled={!canRenameNode(doc, selectedId)} onChange={(event) => onKeyDraft(event.target.value)} />
      </label>
      <button type="button" disabled={!canRenameNode(doc, selectedId)} onClick={onRename}>Rename key</button>

      <label>
        <span>Value</span>
        <input value={valueDraft} disabled={!canUpdateNode(selectedNode)} onChange={(event) => onValueDraft(event.target.value)} />
      </label>
      <button type="button" disabled={!canUpdateNode(selectedNode)} onClick={onUpdate}>Update value</button>

      <div className={`result ${lastCommand.result.ok ? "is-ok" : "is-fail"}`}>
        <strong>{lastCommand.command}</strong>
        <span>{lastCommand.result.ok ? "ok" : lastCommand.result.reason}</span>
      </div>
      {lastCommand.result.ok && lastCommand.result.changes !== undefined ? (
        <ul className="changes">
          {lastCommand.result.changes.map((change) => (
            <li key={`${change.type}-${change.nodeId}`}>
              <span>{change.type}</span>
              <code>{change.nodeId}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
