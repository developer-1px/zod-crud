import { z } from "zod";
import { useJson } from "zod-crud";

const Schema = z.object({
  title: z.string().min(1),
  done: z.boolean(),
});

export function BasicCrud() {
  const [json, ops] = useJson(Schema, { title: "draft", done: false });

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-stone-500">title</span>
        <input
          value={json.title}
          onChange={(e) => ops.set("title", e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={json.done} onChange={(e) => ops.set("done", e.target.checked)} />
        <span>done</span>
      </label>
      <pre className="mt-2 rounded bg-stone-900 p-2 text-xs text-stone-100">{JSON.stringify(json, null, 2)}</pre>
    </div>
  );
}
