import { inlineValueKeyDown } from "./inlineValueKeyDown.js";
import type { InlineEditState } from "./JsonTreeGrid.js";

export function InlineBooleanValueEditor({
  path,
  state,
  onDraft,
  onCommit,
  onCancel,
}: {
  path: string;
  state: InlineEditState;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <label className="inline-checkbox">
      <input
        aria-label={`Edit value for ${path}`}
        autoFocus
        checked={state.draft === "true"}
        type="checkbox"
        onChange={(event) => onDraft(event.currentTarget.checked ? "true" : "false")}
        onKeyDown={inlineValueKeyDown({ onCancel, onCommit })}
      />
      <span>{state.draft === "true" ? "true" : "false"}</span>
    </label>
  );
}
