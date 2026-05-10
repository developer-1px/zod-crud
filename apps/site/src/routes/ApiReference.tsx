import { useMemo, useState } from "react";
import { SourceTabs } from "../code/SourceTabs";
import { apiGroups } from "./api-catalog";
import { getPackageSource } from "./source-registry";
import { tierAccepts, type TierLevel } from "./api-tiers";

const TIER_LABELS: Record<TierLevel, string> = {
  essential: "Essentials",
  common: "Common",
  all: "All",
};

export function ApiReference() {
  const [tier, setTier] = useState<TierLevel>("essential");

  const visibleGroups = useMemo(
    () =>
      apiGroups
        .map((g) => ({ ...g, apis: g.apis.filter((a) => tierAccepts(tier, a.id)) }))
        .filter((g) => g.apis.length > 0),
    [tier],
  );

  const flat = useMemo(() => visibleGroups.flatMap((g) => g.apis.map((a) => ({ group: g.title, ...a }))), [visibleGroups]);
  const [activeId, setActiveId] = useState<string>(() => flat[0]?.id ?? "");
  const active = flat.find((a) => a.id === activeId) ?? flat[0];

  const tabs = active
    ? active.sources.map((s) => {
        const meta = getPackageSource(s.path);
        return {
          key: s.path,
          label: meta.filename,
          filename: meta.filename,
          source: meta.source,
          ...(s.symbols && { symbols: s.symbols }),
        };
      })
    : [];

  return (
    <main className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="shrink-0 border-stone-200 bg-stone-50 md:h-full md:w-56 md:overflow-y-auto md:border-r">
        <div className="sticky top-0 z-10 flex gap-1 border-b border-stone-200 bg-stone-50 p-2">
          {(["essential", "common", "all"] as TierLevel[]).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              aria-pressed={tier === t}
              className="flex-1 rounded px-2 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200 aria-[pressed=true]:bg-stone-900 aria-[pressed=true]:text-stone-50"
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 p-3">
          {visibleGroups.map((g) => (
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

      <section className="flex flex-1 min-h-0 flex-col p-2 md:overflow-hidden">
        {active && (
          <div className="px-3 py-2 border-b border-stone-200">
            <div className="text-[10px] uppercase tracking-wider text-stone-400">{active.group}</div>
            <code className="block font-mono text-sm font-semibold text-stone-900">{active.call}</code>
          </div>
        )}
        <div className="flex flex-1 min-h-0">
          {active && (
            <SourceTabs
              key={active.id}
              tabs={tabs}
              filenamePrefix="packages/zod-crud/src/"
            />
          )}
        </div>
      </section>
    </main>
  );
}
