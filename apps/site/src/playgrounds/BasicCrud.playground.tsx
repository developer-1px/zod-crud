import { z } from "zod/mini";
import type { ZodType } from "zod";
import { useJSONDocument } from "zod-crud/react";

type BasicCrudValue = {
  title: string;
  done: boolean;
};

const Schema = z.object({
  title: z.string().check(z.minLength(1)),
  done: z.boolean(),
}) as unknown as ZodType<BasicCrudValue, BasicCrudValue>;

export const playground = {
  id: "basic-crud",
  order: 1,
  label: "Basic CRUD",
  exports: ["useJSONDocument"],
  sources: [
    "apps/site/src/playgrounds/BasicCrud.playground.tsx",
    "packages/zod-crud/src/hooks/useJSONDocument.ts",
    "packages/zod-crud/src/createJSONDocument.ts",
  ],
} as const;

export function BasicCrud() {
  const { value: json, ops } = useJSONDocument(Schema, { title: "draft", done: false });

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-wider text-stone-500">title</span>
        <input
          value={json.title}
          onChange={(e) => ops.replace("/title", e.target.value)}
          className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={json.done}
          onChange={(e) => ops.replace("/done", e.target.checked)}
        />
        <span>done</span>
      </label>
      <pre className="mt-2 rounded bg-stone-900 p-2 text-xs text-stone-100">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}

export default BasicCrud;
