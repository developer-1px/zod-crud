import type { JsonNode, PasteMode } from "zod-crud";

import type { ApiId } from "./api-catalog.js";
import { type UpdatePreview } from "./command-inputs.js";
import { PasteOptionsInput } from "./PasteOptionsInput.js";
import {
  type EnumValueOption,
} from "./schema-options.js";
import { UpdateValueInput } from "./UpdateValueInput.js";
import { ValidationPreview } from "./ValidationPreview.js";

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
          <UpdateValueInput
            selectedNode={selectedNode}
            valueDraft={valueDraft}
            valueOptions={valueOptions}
            onValueDraft={onValueDraft}
          />
          <ValidationPreview preview={updatePreview} />
        </>
      ) : null}

      {["paste", "canPaste"].includes(activeApi) ? (
        <PasteOptionsInput
          pasteIndexDraft={pasteIndexDraft}
          pasteMode={pasteMode}
          onPasteIndexDraft={onPasteIndexDraft}
          onPasteMode={onPasteMode}
        />
      ) : null}
    </div>
  );
}
