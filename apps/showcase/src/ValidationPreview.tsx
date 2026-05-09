import { type UpdatePreview } from "./command-inputs.js";
import { valueLabel } from "./grid-rows.js";

export function ValidationPreview({ preview }: { preview: UpdatePreview }) {
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
