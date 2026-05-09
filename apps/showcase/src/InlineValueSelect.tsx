import {
  enumOptionDraft,
  enumOptionKey,
  enumOptionLabel,
} from "./schema-options.js";
import { inlineValueKeyDown } from "./inlineValueKeyDown.js";
import type { InlineEditState } from "./JsonTreeGrid.js";

export function InlineValueSelect({
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
    <select
      aria-label={`Edit value for ${path}`}
      autoFocus
      className={state.invalid ? "inline-value-input inline-value-select is-invalid" : "inline-value-input inline-value-select"}
      value={state.draft}
      onChange={(event) => onDraft(event.target.value)}
      onKeyDown={inlineValueKeyDown({ onCancel, onCommit })}
    >
      {state.options.map((option) => (
        <option key={enumOptionKey(option)} value={enumOptionDraft(option)}>
          {enumOptionLabel(option)}
        </option>
      ))}
    </select>
  );
}
