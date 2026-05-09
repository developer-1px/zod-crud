import type { JsonNode } from "zod-crud";
import { InlineBooleanValueEditor } from "./InlineBooleanValueEditor.js";
import { InlineTextValueEditor } from "./InlineTextValueEditor.js";
import { InlineValueSelect } from "./InlineValueSelect.js";
import type { InlineEditState } from "./JsonTreeGrid.js";

export { EnumValueBadge } from "./EnumValueBadge.js";

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
      <InlineValueSelect
        path={path}
        state={state}
        onDraft={onDraft}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (node.type === "boolean") {
    return (
      <InlineBooleanValueEditor
        path={path}
        state={state}
        onDraft={onDraft}
        onCommit={onCommit}
        onCancel={onCancel}
      />
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
    <InlineTextValueEditor
      node={node}
      path={path}
      state={state}
      onDraft={onDraft}
      onCommit={onCommit}
      onCancel={onCancel}
    />
  );
}
