import type {
  JsonNode,
  JsonValue,
  NodeId,
  PasteMode,
} from "zod-crud";

import {
  apiCallLabel,
  type ApiId,
} from "./api-catalog.js";
import {
  commandByApi,
  commandInputLabel,
} from "./command-matrix.js";
import { type UpdatePreview } from "./command-inputs.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { entityDefinitions } from "./entities.js";
import {
  type EnumValueOption,
} from "./schema-options.js";
import { stringify } from "./playground-helpers.js";
import { ApiInputs } from "./ApiInputs.js";

export type ApiRun = {
  api: ApiId;
  call: string;
  output: unknown;
};

export function ApiWorkbench({
  activeApi,
  activeEntityId,
  keyDraft,
  findKeyDraft,
  jsonValue,
  jsonValueDraft,
  lastRun,
  pasteIndexDraft,
  pasteMode,
  selectedIds,
  selectedNode,
  selectedPath,
  subscriptionEvents,
  updatePreview,
  valueDraft,
  valueOptions,
  onEntitySelect,
  onFindKeyDraft,
  onJsonValueDraft,
  onKeyDraft,
  onPasteIndexDraft,
  onPasteMode,
  onRun,
  onValueDraft,
}: {
  activeApi: ApiId;
  activeEntityId: string;
  keyDraft: string;
  findKeyDraft: string;
  jsonValue: JsonValue;
  jsonValueDraft: string;
  lastRun: ApiRun;
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  selectedIds: NodeId[];
  selectedNode: JsonNode | undefined;
  selectedPath: string;
  subscriptionEvents: number;
  updatePreview: UpdatePreview;
  valueDraft: string;
  valueOptions: EnumValueOption[];
  onEntitySelect: (entityId: string) => void;
  onFindKeyDraft: (value: string) => void;
  onJsonValueDraft: (value: string) => void;
  onKeyDraft: (value: string) => void;
  onPasteIndexDraft: (value: string) => void;
  onPasteMode: (value: PasteMode) => void;
  onRun: () => void;
  onValueDraft: (value: string) => void;
}) {
  return (
    <div className="api-workbench">
      <section className="workbench-section">
        <h3>Entity</h3>
        <EntityRegistry
          entities={entityDefinitions}
          activeEntityId={activeEntityId}
          onSelect={onEntitySelect}
        />
      </section>

      <section className="workbench-section">
        <h3>Selection</h3>
        <pre className="mini-json">{stringify({
          activeId: selectedNode?.id ?? null,
          path: selectedPath,
          type: selectedNode?.type ?? "missing",
          key: selectedNode?.key ?? null,
          selectedIds,
        })}</pre>
      </section>

      <section className="workbench-section">
        <h3>Inputs</h3>
        <ApiInputs
          activeApi={activeApi}
          findKeyDraft={findKeyDraft}
          jsonValueDraft={jsonValueDraft}
          keyDraft={keyDraft}
          pasteIndexDraft={pasteIndexDraft}
          pasteMode={pasteMode}
          selectedNode={selectedNode}
          updatePreview={updatePreview}
          valueDraft={valueDraft}
          valueOptions={valueOptions}
          onFindKeyDraft={onFindKeyDraft}
          onJsonValueDraft={onJsonValueDraft}
          onKeyDraft={onKeyDraft}
          onPasteIndexDraft={onPasteIndexDraft}
          onPasteMode={onPasteMode}
          onValueDraft={onValueDraft}
        />
        <button type="button" className="run-button" onClick={onRun}>
          Run {apiCallLabel(activeApi)}
        </button>
      </section>

      <section className="workbench-section">
        <h3>Last result</h3>
        <pre className="json-output">{stringify({
          api: lastRun.api,
          call: lastRun.call,
          output: lastRun.output,
        })}</pre>
      </section>

      <CommandDocs activeApi={activeApi} subscriptionEvents={subscriptionEvents} />

      <section className="workbench-section">
        <h3>toJson()</h3>
        <pre className="json-output">{stringify(jsonValue)}</pre>
      </section>
    </div>
  );
}

function CommandDocs({
  activeApi,
  subscriptionEvents,
}: {
  activeApi: ApiId;
  subscriptionEvents: number;
}) {
  const command = commandByApi(activeApi);

  return (
    <section className="workbench-section docs-section">
      <h3>Docs</h3>
      <dl className="command-docs">
        <div>
          <dt>User input</dt>
          <dd>{commandInputLabel(command.input)}</dd>
        </div>
        <div>
          <dt>Keymap</dt>
          <dd>{command.keys === "" ? "manual only" : command.keys}</dd>
        </div>
        <div>
          <dt>Public call</dt>
          <dd><code>{command.call}</code></dd>
        </div>
        <div>
          <dt>Subscription events</dt>
          <dd>{subscriptionEvents}</dd>
        </div>
      </dl>
      {command.notes === "" ? null : <p className="api-hint">{command.notes}</p>}
    </section>
  );
}
