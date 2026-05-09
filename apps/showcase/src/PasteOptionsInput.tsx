import type { PasteMode } from "zod-crud";

export function PasteOptionsInput({
  pasteIndexDraft,
  pasteMode,
  onPasteIndexDraft,
  onPasteMode,
}: {
  pasteIndexDraft: string;
  pasteMode: PasteMode;
  onPasteIndexDraft: (value: string) => void;
  onPasteMode: (value: PasteMode) => void;
}) {
  return (
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
  );
}
