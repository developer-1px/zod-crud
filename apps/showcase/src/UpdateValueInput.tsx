import type { JsonNode } from "zod-crud";

import {
  enumOptionDraft,
  enumOptionKey,
  enumOptionLabel,
  type EnumValueOption,
} from "./schema-options.js";

export function UpdateValueInput({
  selectedNode,
  valueDraft,
  valueOptions,
  onValueDraft,
}: {
  selectedNode: JsonNode | undefined;
  valueDraft: string;
  valueOptions: EnumValueOption[];
  onValueDraft: (value: string) => void;
}) {
  return (
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
  );
}
