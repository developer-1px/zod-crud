import { apiCallLabel } from "./api-catalog.js";
import { CommandMatrix } from "./CommandMatrix.js";
import { JsonTreeGrid } from "./JsonTreeGrid.js";
import { PanelTitle } from "./PanelTitle.js";
import { columns, pathString } from "./grid-rows.js";
import { ApiWorkbench } from "./ApiWorkbench.js";
import { usePlayground } from "./usePlayground.js";

export function Playground() {
  const p = usePlayground();

  return (
    <>
      <header className="app-header">
        <div className="header-main">
          <div>
            <h1>zod-crud API Playground</h1>
            <span>{p.activeEntity.schemaName}</span>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => p.runApi("createJsonCrud")}>Recreate editor</button>
          </div>
        </div>
      </header>

      <main className="playground-shell">
        <aside className="panel api-panel">
          <PanelTitle title="Command matrix" detail="keymap -> public call" />
          <CommandMatrix activeApi={p.activeApi} onRun={p.runApi} onSelect={p.setActiveApi} />
        </aside>

        <section className="panel tree-panel">
          <PanelTitle title="JsonDoc tree" detail={`${p.selectedIds.size} selected`} />
          <JsonTreeGrid
            doc={p.doc}
            columns={columns}
            rows={p.rows}
            changedRows={p.changedRows}
            valueOptionsByNodeId={p.rowValueOptions}
            selectedId={p.safeSelectedId}
            selectedIds={p.selectedIds}
            inlineEdit={p.inlineEdit === null ? null : {
              ...p.inlineEdit,
              invalid: p.inlineUpdatePreview?.state === "invalid",
              options: p.inlineValueOptions,
            }}
            inlineStatus={p.inlineStatus}
            onSelect={p.selectGridRow}
            onMove={p.selectGridRow}
            onExpand={p.setExpanded}
            onStartValueEdit={p.startInlineValueEdit}
            onInlineValueDraft={(draft) => {
              p.setValueDraft(draft);
              p.setInlineNotice(null);
              p.setInlineEdit((current) => current === null ? null : { ...current, draft });
            }}
            onCommitValueEdit={p.commitInlineValueEdit}
            onCancelValueEdit={() => {
              p.setInlineEdit(null);
              p.setInlineNotice(null);
            }}
          />
        </section>

        <aside className="panel workbench-panel">
          <PanelTitle title="Runner" detail={apiCallLabel(p.activeApi)} />
          <ApiWorkbench
            activeApi={p.activeApi}
            activeEntityId={p.activeEntity.id}
            keyDraft={p.keyDraft}
            findKeyDraft={p.findKeyDraft}
            jsonValue={p.jsonValue}
            jsonValueDraft={p.jsonValueDraft}
            lastRun={p.lastRun}
            pasteIndexDraft={p.pasteIndexDraft}
            pasteMode={p.pasteMode}
            selectedIds={p.selectedIdList}
            selectedNode={p.selectedNode}
            selectedPath={pathString(p.doc, p.safeSelectedId)}
            subscriptionEvents={p.subscriptionEvents}
            updatePreview={p.updatePreview}
            valueDraft={p.valueDraft}
            valueOptions={p.selectedValueOptions}
            onEntitySelect={p.selectEntity}
            onFindKeyDraft={p.setFindKeyDraft}
            onJsonValueDraft={p.setJsonValueDraft}
            onKeyDraft={p.setKeyDraft}
            onPasteIndexDraft={p.setPasteIndexDraft}
            onPasteMode={p.setPasteMode}
            onRun={() => p.runApi()}
            onValueDraft={p.setValueDraft}
          />
        </aside>
      </main>
    </>
  );
}
