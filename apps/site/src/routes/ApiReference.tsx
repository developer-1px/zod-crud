import { useMemo, useState } from "react";
import { SourceTabs } from "../code/SourceTabs";
import { apiGroups, type ApiId } from "./api-catalog";
import { sourceMap } from "./source-registry";

export function ApiReference() {
  const flat = useMemo(() => apiGroups.flatMap((g) => g.apis.map((a) => ({ group: g.title, ...a }))), []);
  const [activeId, setActiveId] = useState<ApiId>("createJsonCrud");
  const active = flat.find((a) => a.id === activeId)!;
  const tabs = active.sources.map((s) => {
    const meta = sourceMap[s.key];
    return {
      key: s.key,
      label: meta.filename,
      filename: meta.filename,
      source: meta.source,
      ...(s.symbols && { symbols: s.symbols }),
    };
  });

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
                          {a.id}
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
              key={active.id}
              tabs={tabs}
              filenamePrefix="packages/zod-crud/src/"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
