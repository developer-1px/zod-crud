import { useEffect, useState } from "react";
import { z } from "zod";
import { createJsonCrud, type NodeId } from "zod-crud";

const Schema = z.object({
  tags: z.array(z.string().min(1)),
});

export function ClipboardArray() {
  const [crud] = useState(() => createJsonCrud(Schema, { tags: ["docs", "design", "ssot"] }));
  const [doc, setDoc] = useState(() => crud.snapshot());
  const [selected, setSelected] = useState<NodeId | null>(null);
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const tagsId = crud.find(doc.rootId, "tags")!;
  const items = doc.nodes[tagsId]!.children;

  const onCopy = () => { if (selected) crud.copy(selected); };
  const onCut = () => { if (selected) crud.cut(selected); };
  const onPaste = () => { crud.paste(tagsId, { mode: "child" }); };
  const onDelete = () => { if (selected) crud.delete(selected); };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-0.5 rounded border border-stone-200 bg-white p-1">
        {items.map((id) => {
          const v = doc.nodes[id]!.value as string;
          const isSel = id === selected;
          return (
            <li key={id}>
              <button
                onClick={() => setSelected(id)}
                aria-selected={isSel}
                className="block w-full rounded px-2 py-1 text-left text-sm text-stone-700 hover:bg-stone-100 aria-selected:bg-sky-100 aria-selected:text-sky-900"
              >
                {v}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <button onClick={onCopy} disabled={!selected} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">copy</button>
        <button onClick={onCut} disabled={!selected} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">cut</button>
        <button onClick={onPaste} className="rounded border border-stone-300 bg-white px-2 py-1">paste→tags</button>
        <button onClick={onDelete} disabled={!selected} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">delete</button>
        <button onClick={() => crud.undo()} disabled={!crud.canUndo()} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">undo</button>
        <button onClick={() => crud.redo()} disabled={!crud.canRedo()} className="rounded border border-stone-300 bg-white px-2 py-1 disabled:opacity-50">redo</button>
      </div>
      <pre className="mt-1 rounded bg-stone-900 p-2 text-xs text-stone-100">{JSON.stringify(crud.toJson(), null, 2)}</pre>
    </div>
  );
}
