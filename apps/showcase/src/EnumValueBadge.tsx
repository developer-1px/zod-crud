import {
  enumOptionLabel,
  type EnumValueOption,
} from "./schema-options.js";

export function EnumValueBadge({ value }: { value: EnumValueOption }) {
  return (
    <span className="enum-value-badge" title={`enum ${enumOptionLabel(value)}`}>
      {enumOptionLabel(value)}
    </span>
  );
}
