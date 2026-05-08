import type { JsonNode, PasteMode } from "zod-crud";

import type { ApiId } from "./api-catalog.js";
import { type UpdatePreview } from "./command-inputs.js";
import { valueLabel } from "./grid-rows.js";
import {
  enumOptionDraft,
  enumOptionKey,
  enumOptionLabel,
  type EnumValueOption,
} from "./schema-options.js";

export function ApiInputs({
  activeApi,
  findKeyDraft,
  jsonValueDraft,
  keyDraft,
  pasteIndexDraft,
  pasteMode,
  selectedNode,
  updatePreview,
  valueDraft,
  valueOptions,
  onFindKeyDraft,
  onJsonValueDraft,
  onKeyDraft,
  onPasteIndexDraft,
  onPasteMode,
  onValueDraft,
}: {
  activeApi: ApiId;
  findKeyDraft: string;
  jsonValueDraft: string;
  keyDraft: string;
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  selectedNode: JsonNode | undefined;
  updatePreview: UpdatePreview;
  valueDraft: string;
  valueOptions: EnumValueOption[];
  onFindKeyDraft: (value: string) => void;
  onJsonValueDraft: (value: string) => void;
  onKeyDraft: (value: string) => void;
  onPasteIndexDraft: (value: string) => void;
  onPasteMode: (value: PasteMode) => void;
  onValueDraft: (value: string) => void;
}) {
  const needsKey = ["create", "rename"].includes(activeApi);
  const needsJsonValue = ["create", "insertAfter", "insertBefore", "appendChild"].includes(activeApi);

  return (
    <div className="input-stack">
      {activeApi === "find" ? (
        <label>
          <span>key</span>
          <input value={findKeyDraft} onChange={(event) => onFindKeyDraft(event.target.value)} />
        </label>
      ) : null}

      {needsKey ? (
        <label>
          <span>{activeApi === "rename" ? "new object key" : "child key or index"}</span>
          <input value={keyDraft} onChange={(event) => onKeyDraft(event.target.value)} />
        </label>
      ) : null}

      {needsJsonValue ? (
        <label>
          <span>value JSON, empty uses defaultFor/Zod default</span>
          <textarea
            rows={5}
            value={jsonValueDraft}
            onChange={(event) => onJsonValueDraft(event.target.value)}
          />
        </label>
      ) : null}

      {activeApi === "update" ? (
        <>
          <label>
            <span>primitive value</span>
            {valueOptions.length > 0 ? (
              <select
                value={valueDraft}
                disabled={selectedNode === undefined || selectedNode.children.length > 0}
                onChange={(event) => onValueDraft(event.target.value)}
              >
                {valueOptions.map((option) => (
                  <option key={enumOptionKey(option)} value={enumOptionDraft(option)}>
                    {enumOptionLabel(option)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={valueDraft}
                disabled={selectedNode === undefined || selectedNode.children.length > 0}
                onChange={(event) => onValueDraft(event.target.value)}
              />
            )}
          </label>
          <ValidationPreview preview={updatePreview} />
        </>
      ) : null}

      {["paste", "canPaste"].includes(activeApi) ? (
        <div className="split-inputs">
          <label>
            <span>mode</span>
            <select value={pasteMode} onChange={(event) => onPasteMode(event.target.value as PasteMode)}>
              <option value="auto">auto</option>
              <option value="child">child</option>
              <option value="overwrite">overwrite</option>
            </select>
          </label>
          <label>
            <span>index</span>
            <input value={pasteIndexDraft} onChange={(event) => onPasteIndexDraft(event.target.value)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function ValidationPreview({ preview }: { preview: UpdatePreview }) {
  if (preview.state === "idle") {
    return <div className="validation is-idle">{preview.message}</div>;
  }

  if (preview.state === "valid") {
    return (
      <div className="validation is-valid">
        <strong>Preview valid</strong>
        <span>{valueLabel(preview.value)}</span>
      </div>
    );
  }

  return (
    <div className="validation is-invalid">
      <strong>Preview invalid</strong>
      <span>{preview.message}</span>
    </div>
  );
}
