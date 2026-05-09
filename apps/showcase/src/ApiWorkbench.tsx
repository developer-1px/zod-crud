import {
  apiCallLabel,
} from "./api-catalog.js";
import type { ApiWorkbenchProps } from "./ApiWorkbenchProps.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { entityDefinitions } from "./entities.js";
import { CommandDocs } from "./CommandDocs.js";
import { stringify } from "./playground-helpers.js";
import { ApiInputs } from "./ApiInputs.js";
import { RunResult } from "./RunResult.js";
import { SelectionSummary } from "./SelectionSummary.js";

export type { ApiRun } from "./ApiRun.js";

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
}: ApiWorkbenchProps) {
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
        <SelectionSummary
          selectedIds={selectedIds}
          selectedNode={selectedNode}
          selectedPath={selectedPath}
        />
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
        <RunResult lastRun={lastRun} />
      </section>

      <CommandDocs activeApi={activeApi} subscriptionEvents={subscriptionEvents} />

      <section className="workbench-section">
        <h3>toJson()</h3>
        <pre className="json-output">{stringify(jsonValue)}</pre>
      </section>
    </div>
  );
}
