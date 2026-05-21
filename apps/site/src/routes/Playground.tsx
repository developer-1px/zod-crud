import { useState, type ReactElement } from "react";
import { SourceTabs } from "../code/SourceTabs";
import { BasicCrud } from "../playgrounds/BasicCrud.playground";
import { ClipboardArray } from "../playgrounds/ClipboardArray.playground";
import { RejectedDrift } from "../playgrounds/RejectedDrift.playground";

import basicSrc from "../playgrounds/BasicCrud.playground.tsx?raw";
import clipboardSrc from "../playgrounds/ClipboardArray.playground.tsx?raw";
import rejectSrc from "../playgrounds/RejectedDrift.playground.tsx?raw";

type PlaygroundCase = {
  key: string;
  label: string;
  filename: string;
  source: string;
  render: () => ReactElement;
};

const cases: PlaygroundCase[] = [
  { key: "basic", label: "Basic CRUD", filename: "BasicCrud.playground.tsx", source: basicSrc, render: BasicCrud },
  { key: "clipboard", label: "Clipboard + history", filename: "ClipboardArray.playground.tsx", source: clipboardSrc, render: ClipboardArray },
  { key: "reject", label: "Schema gate", filename: "RejectedDrift.playground.tsx", source: rejectSrc, render: RejectedDrift },
];

export function Playground() {
  const [activeKey, setActiveKey] = useState<string>(cases[0]!.key);
  const active = cases.find((item) => item.key === activeKey)!;
  const Render = active.render;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900">Playground</h1>
      </header>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="shrink-0 border-stone-200 bg-stone-50 md:h-full md:w-56 md:overflow-y-auto md:border-r">
          <div className="flex flex-col gap-1 p-3">
            {cases.map((item) => {
              const current = item.key === activeKey;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveKey(item.key)}
                  aria-current={current ? "page" : undefined}
                  className="rounded px-2 py-2 text-left text-sm font-medium text-stone-700 hover:bg-stone-200 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex flex-1 min-h-0 flex-col gap-4 p-4 md:flex-row md:overflow-hidden">
          <div className="flex flex-1 min-h-0 flex-col rounded-md border border-stone-200 bg-stone-50 p-4">
            <Render />
          </div>
          <div className="flex flex-1 min-h-0">
            <SourceTabs
              key={active.key}
              tabs={[{ key: active.key, label: active.filename, filename: active.filename, source: active.source }]}
              filenamePrefix="apps/site/src/playgrounds/"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
