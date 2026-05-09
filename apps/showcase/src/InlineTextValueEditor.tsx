import type { JsonNode } from "zod-crud";

import { inlineValueKeyDown } from "./inlineValueKeyDown.js";
import type { InlineEditState } from "./JsonTreeGrid.js";

export function InlineTextValueEditor({
  node,
  path,
  state,
  onDraft,
  onCommit,
  onCancel,
}: {
  node: JsonNode;
  path: string;
  state: InlineEditState;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="inline-value-form"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCommit();
      }}
    >
      <input
        aria-label={`Edit value for ${path}`}
        autoFocus
        className={state.invalid ? "inline-value-input is-invalid" : "inline-value-input"}
        inputMode={node.type === "number" ? "decimal" : "text"}
        value={state.draft}
        onChange={(event) => onDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={inlineValueKeyDown({ onCancel, onCommit })}
      />
    </form>
  );
}
