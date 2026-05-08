import { useEffect, useState } from "react";
import { z } from "zod";
import { createJsonCrud } from "zod-crud";

const Schema = z.object({
  title: z.string().min(1),
  done: z.boolean(),
});

export function BasicCrud() {
  const [crud] = useState(() => createJsonCrud(Schema, { title: "draft", done: false }));
  const [doc, setDoc] = useState(() => crud.snapshot());
  useEffect(() => crud.subscribe(() => setDoc(crud.snapshot())), [crud]);

  const root = doc.rootId;
  const titleId = crud.find(root, "title")!;
  const doneId = crud.find(root, "done")!;
  const title = doc.nodes[titleId]!.value as string;
  const done = doc.nodes[doneId]!.value as boolean;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-stone-500">title</span>
        <input
          value={title}
          onChange={(e) => crud.update(titleId, e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={done} onChange={(e) => crud.update(doneId, e.target.checked)} />
        <span>done</span>
      </label>
      <pre className="mt-2 rounded bg-stone-900 p-2 text-xs text-stone-100">{JSON.stringify(crud.toJson(), null, 2)}</pre>
    </div>
  );
}
