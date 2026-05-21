import { useState, type ReactElement } from "react";
import { BasicCrud } from "../playgrounds/BasicCrud.playground";
import { ClipboardArray } from "../playgrounds/ClipboardArray.playground";
import { RejectedDrift } from "../playgrounds/RejectedDrift.playground";

type PlaygroundCase = {
  key: string;
  label: string;
  render: () => ReactElement;
};

const cases: PlaygroundCase[] = [
  { key: "basic", label: "CRUD", render: BasicCrud },
  { key: "clipboard", label: "Clipboard", render: ClipboardArray },
  { key: "reject", label: "Schema gate", render: RejectedDrift },
];

export function Playground() {
  const [activeKey, setActiveKey] = useState<string>(cases[0]!.key);
  const active = cases.find((item) => item.key === activeKey)!;
  const Render = active.render;

  return (
    <main className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="shrink-0 border-stone-200 bg-stone-50 md:h-full md:w-48 md:overflow-y-auto md:border-r">
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

      <section className="flex flex-1 min-h-0 p-4 md:overflow-auto">
        <Render />
      </section>
    </main>
  );
}
