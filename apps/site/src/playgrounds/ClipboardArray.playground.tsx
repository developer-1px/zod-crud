import { useState } from "react";
import { z } from "zod/mini";
import type { ZodType } from "zod";
import { useJSONDocument } from "zod-crud/react";

type ClipboardArrayValue = {
  tags: string[];
};

const Schema = z.object({
  tags: z.array(z.string().check(z.minLength(1))),
}) as unknown as ZodType<ClipboardArrayValue, ClipboardArrayValue>;

export const playground = {
  id: "clipboard-array",
  order: 2,
  label: "Clipboard Array",
  exports: ["useJSONDocument", "createClipboard"],
  sources: [
    "apps/site/src/playgrounds/ClipboardArray.playground.tsx",
    "packages/zod-crud/src/clipboard.ts",
    "packages/zod-crud/src/hooks/useJSONDocument.ts",
  ],
} as const;

export function ClipboardArray() {
  const { value: json, ops } = useJSONDocument(
    Schema,
    { tags: ["docs", "design", "ssot"] },
    { history: 50 },
  );
  const [selected, setSelected] = useState<number | null>(null);

  const onCopy = () => {
    if (selected !== null) {
      ops.copy(`/tags/${selected}` as `/tags/${number}`, "/tags/-");
    }
  };
  const onCut = () => {
    if (selected !== null) {
      ops.patch([
        { op: "copy", from: `/tags/${selected}`, path: "/tags/-" },
        { op: "remove", path: `/tags/${selected}` },
      ]);
      setSelected(null);
    }
  };
  const onDuplicateAtEnd = () => {
    if (selected !== null) {
      ops.copy(`/tags/${selected}` as `/tags/${number}`, "/tags/-");
    }
  };
  const onDelete = () => {
    if (selected !== null) {
      ops.remove(`/tags/${selected}` as `/tags/${number}`);
      setSelected(null);
    }
  };

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <ul className="flex flex-col gap-0.5 rounded border border-stone-200 bg-white p-1">
        {json.tags.map((tag, i) => {
          const isSel = i === selected;
          return (
            <li key={`${i}:${tag}`}>
              <button
                onClick={() => setSelected(i)}
                aria-selected={isSel}
                className="block w-full rounded px-2 py-1 text-left text-sm text-stone-700 hover:bg-stone-100 aria-selected:bg-sky-100 aria-selected:text-sky-900"
              >
                {tag}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <button onClick={onCopy} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">copy</button>
        <button onClick={onCut} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">cut</button>
        <button onClick={onDuplicateAtEnd} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">duplicate</button>
        <button onClick={onDelete} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">delete</button>
        <button onClick={() => ops.undo()} disabled={!ops.canUndo()} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">undo</button>
        <button onClick={() => ops.redo()} disabled={!ops.canRedo()} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">redo</button>
      </div>
      <pre className="mt-1 rounded bg-stone-900 p-2 text-xs text-stone-100">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}

export default ClipboardArray;
