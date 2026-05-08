import { useMemo, useState } from "react";
import { SourceTabs } from "../code/SourceTabs";

// SSOT: 라이브러리 소스 그대로 — 문서가 코드보다 뒤처질 수 없다.
import indexSrc from "../../../../packages/zod-crud/src/index.ts?raw";
import typesSrc from "../../../../packages/zod-crud/src/types.ts?raw";
import jsonCrudSrc from "../../../../packages/zod-crud/src/editor/json-crud.ts?raw";
import jsonPasteSrc from "../../../../packages/zod-crud/src/editor/json-paste.ts?raw";
import jsonDocSrc from "../../../../packages/zod-crud/src/document/json-doc.ts?raw";
import opResultSrc from "../../../../packages/zod-crud/src/editor/operation-result.ts?raw";
import jsonValidationSrc from "../../../../packages/zod-crud/src/schema/json-validation.ts?raw";

type ApiId =
  | "createJsonCrud" | "serialize" | "deserialize" | "getPath"
  | "snapshot" | "toJson" | "read" | "pathOf" | "find"
  | "create" | "insertAfter" | "insertBefore" | "appendChild"
  | "update" | "rename" | "delete" | "deleteMany"
  | "copy" | "copyMany" | "cut" | "cutMany" | "paste"
  | "canCopyMany" | "canCutMany" | "canDeleteMany" | "canPaste" | "canUndo" | "canRedo"
  | "subscribe" | "undo" | "redo";

type ApiGroup = {
  title: string;
  apis: Array<{ id: ApiId; label: string; call: string; sourceKey: SourceKey; symbols: string[] }>;
};

type SourceKey = "index" | "types" | "json-crud" | "json-paste" | "json-doc" | "op-result" | "validation";

const sourceMap: Record<SourceKey, { filename: string; source: string }> = {
  "index": { filename: "index.ts", source: indexSrc },
  "types": { filename: "types.ts", source: typesSrc },
  "json-crud": { filename: "editor/json-crud.ts", source: jsonCrudSrc },
  "json-paste": { filename: "editor/json-paste.ts", source: jsonPasteSrc },
  "json-doc": { filename: "document/json-doc.ts", source: jsonDocSrc },
  "op-result": { filename: "editor/operation-result.ts", source: opResultSrc },
  "validation": { filename: "schema/json-validation.ts", source: jsonValidationSrc },
};

const apiGroups: ApiGroup[] = [
  {
    title: "Factory",
    apis: [
      { id: "createJsonCrud", label: "createJsonCrud", call: "createJsonCrud(schema, initial, options?)", sourceKey: "json-crud", symbols: ["createJsonCrud"] },
    ],
  },
  {
    title: "Document",
    apis: [
      { id: "serialize", label: "serialize", call: "serialize(value)", sourceKey: "json-doc", symbols: ["serialize"] },
      { id: "deserialize", label: "deserialize", call: "deserialize(doc, nodeId?)", sourceKey: "json-doc", symbols: ["deserialize"] },
      { id: "getPath", label: "getPath", call: "getPath(doc, nodeId)", sourceKey: "json-doc", symbols: ["getPath"] },
    ],
  },
  {
    title: "Read",
    apis: [
      { id: "snapshot", label: "snapshot", call: "crud.snapshot()", sourceKey: "json-crud", symbols: [] },
      { id: "toJson", label: "toJson", call: "crud.toJson()", sourceKey: "json-crud", symbols: [] },
      { id: "read", label: "read", call: "crud.read(nodeId?)", sourceKey: "json-crud", symbols: [] },
      { id: "pathOf", label: "pathOf", call: "crud.pathOf(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "find", label: "find", call: "crud.find(parentId, key)", sourceKey: "json-crud", symbols: [] },
    ],
  },
  {
    title: "Mutation",
    apis: [
      { id: "create", label: "create", call: "crud.create(parentId, key, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "insertAfter", label: "insertAfter", call: "crud.insertAfter(siblingId, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "insertBefore", label: "insertBefore", call: "crud.insertBefore(siblingId, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "appendChild", label: "appendChild", call: "crud.appendChild(parentId, value?)", sourceKey: "json-crud", symbols: [] },
      { id: "update", label: "update", call: "crud.update(nodeId, value)", sourceKey: "json-crud", symbols: [] },
      { id: "rename", label: "rename", call: "crud.rename(nodeId, key)", sourceKey: "json-crud", symbols: [] },
      { id: "delete", label: "delete", call: "crud.delete(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "deleteMany", label: "deleteMany", call: "crud.deleteMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
    ],
  },
  {
    title: "Clipboard",
    apis: [
      { id: "copy", label: "copy", call: "crud.copy(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "copyMany", label: "copyMany", call: "crud.copyMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "cut", label: "cut", call: "crud.cut(nodeId)", sourceKey: "json-crud", symbols: [] },
      { id: "cutMany", label: "cutMany", call: "crud.cutMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "paste", label: "paste", call: "crud.paste(targetId, options?)", sourceKey: "json-paste", symbols: [] },
      { id: "canPaste", label: "canPaste", call: "crud.canPaste(targetId, options?)", sourceKey: "json-paste", symbols: [] },
      { id: "canCopyMany", label: "canCopyMany", call: "crud.canCopyMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "canCutMany", label: "canCutMany", call: "crud.canCutMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
      { id: "canDeleteMany", label: "canDeleteMany", call: "crud.canDeleteMany(nodeIds)", sourceKey: "json-crud", symbols: [] },
    ],
  },
  {
    title: "History",
    apis: [
      { id: "undo", label: "undo", call: "crud.undo()", sourceKey: "json-crud", symbols: [] },
      { id: "redo", label: "redo", call: "crud.redo()", sourceKey: "json-crud", symbols: [] },
      { id: "canUndo", label: "canUndo", call: "crud.canUndo()", sourceKey: "json-crud", symbols: [] },
      { id: "canRedo", label: "canRedo", call: "crud.canRedo()", sourceKey: "json-crud", symbols: [] },
      { id: "subscribe", label: "subscribe", call: "crud.subscribe(listener)", sourceKey: "json-crud", symbols: [] },
    ],
  },
];

export function ApiReference() {
  const flat = useMemo(() => apiGroups.flatMap((g) => g.apis.map((a) => ({ group: g.title, ...a }))), []);
  const [activeId, setActiveId] = useState<ApiId>("createJsonCrud");
  const active = flat.find((a) => a.id === activeId)!;
  const sourceMeta = sourceMap[active.sourceKey];

  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="text-xs font-medium uppercase tracking-wider text-stone-400">Reference</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-900">API</h1>
        <p className="mt-1 text-sm text-stone-600">
          Source-of-truth viewer. Selecting an API focuses its declaration line in the
          actual library file — no rewritten doc surface.
        </p>
      </header>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="shrink-0 border-stone-200 bg-stone-50 md:h-full md:w-64 md:overflow-y-auto md:border-r">
          <div className="flex flex-col gap-4 p-3">
            {apiGroups.map((g) => (
              <div key={g.title} className="flex flex-col gap-0.5">
                <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  {g.title}
                </div>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {g.apis.map((a) => {
                    const current = a.id === activeId;
                    return (
                      <li key={a.id}>
                        <button
                          onClick={() => setActiveId(a.id)}
                          aria-current={current ? "page" : undefined}
                          className="block w-full rounded px-2 py-1 text-left font-mono text-[12px] text-stone-700 hover:bg-stone-200 hover:text-stone-900 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
                        >
                          {a.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex flex-1 min-h-0 flex-col gap-4 p-4 md:overflow-hidden">
          <div className="rounded-md border border-stone-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              {active.group}
            </div>
            <div className="mt-1 font-mono text-sm text-stone-900">{active.call}</div>
          </div>
          <div className="flex flex-1 min-h-0">
            <SourceTabs
              key={active.sourceKey + ":" + active.id}
              tabs={[{
                key: active.sourceKey,
                label: sourceMeta.filename,
                filename: sourceMeta.filename,
                source: sourceMeta.source,
                symbols: active.symbols.length > 0 ? active.symbols : undefined,
              }]}
              filenamePrefix="packages/zod-crud/src/"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
