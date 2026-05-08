import type { JsonNode } from "zod-crud";
import {
  enumOptionDraft,
  enumOptionKey,
  enumOptionLabel,
  type EnumValueOption,
} from "./schema-options.js";
import type { InlineEditState } from "./JsonTreeGrid.js";

export function EnumValueBadge({ value }: { value: EnumValueOption }) {
  return (
    <span className="enum-value-badge" title={`enum ${enumOptionLabel(value)}`}>
      {enumOptionLabel(value)}
    </span>
  );
}

export function InlineValueEditor({
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
  if (state.options.length > 0) {
    return (
      <select
        aria-label={`Edit value for ${path}`}
        autoFocus
        className={state.invalid ? "inline-value-input inline-value-select is-invalid" : "inline-value-input inline-value-select"}
        value={state.draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();

          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        {state.options.map((option) => (
          <option key={enumOptionKey(option)} value={enumOptionDraft(option)}>
            {enumOptionLabel(option)}
          </option>
        ))}
      </select>
    );
  }

  if (node.type === "boolean") {
    return (
      <label className="inline-checkbox">
        <input
          aria-label={`Edit value for ${path}`}
          autoFocus
          checked={state.draft === "true"}
          type="checkbox"
          onChange={(event) => onDraft(event.currentTarget.checked ? "true" : "false")}
          onKeyDown={(event) => {
            event.stopPropagation();

            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <span>{state.draft === "true" ? "true" : "false"}</span>
      </label>
    );
  }

  if (node.type === "null") {
    return (
      <label className="inline-checkbox">
        <input
          aria-label={`Edit value for ${path}`}
          checked={true}
          disabled={true}
          type="checkbox"
        />
        <span>null</span>
      </label>
    );
  }

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
        onKeyDown={(event) => {
          event.stopPropagation();

          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </form>
  );
}
