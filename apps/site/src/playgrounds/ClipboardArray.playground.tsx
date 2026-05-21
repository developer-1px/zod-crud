import { z } from "zod/mini";
import type { ZodType } from "zod";
import { useJSONDocument } from "zod-crud/react";

type ClipboardArrayValue = {
  tags: string[];
};

const Schema = z.object({
  tags: z.array(z.string().check(z.minLength(1))),
}) as unknown as ZodType<ClipboardArrayValue, ClipboardArrayValue>;

export function ClipboardArray() {
  const doc = useJSONDocument(
    Schema,
    { tags: ["docs", "design", "ssot"] },
    { history: 50, selection: { mode: "single" } },
  );
  const { value: json } = doc;
  const selected = doc.selection?.primaryPointer ?? null;

  const selectTag = (index: number) => {
    doc.selection?.collapse(`/tags/${index}` as `/tags/${number}`);
  };

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <ul className="flex flex-col gap-0.5 rounded border border-stone-200 bg-white p-1">
        {json.tags.map((tag, i) => {
          const pointer = `/tags/${i}` as `/tags/${number}`;
          const isSel = pointer === selected;
          return (
            <li key={`${i}:${tag}`}>
              <button
                onClick={() => selectTag(i)}
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
        <button onClick={() => doc.clipboard.copy()} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">copy</button>
        <button onClick={() => doc.clipboard.cut()} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">cut</button>
        <button onClick={() => doc.clipboard.paste("after")} disabled={selected === null || !doc.clipboard.hasData} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">paste</button>
        <button onClick={() => doc.commands.duplicate()} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">duplicate</button>
        <button onClick={() => doc.commands.remove()} disabled={selected === null} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">delete</button>
        <button onClick={() => doc.commands.undo()} disabled={!doc.history.canUndo} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">undo</button>
        <button onClick={() => doc.commands.redo()} disabled={!doc.history.canRedo} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">redo</button>
      </div>
      <pre className="mt-1 rounded bg-stone-900 p-2 text-xs text-stone-100">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}

export default ClipboardArray;
