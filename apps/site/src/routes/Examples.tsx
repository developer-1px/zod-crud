import { useState, type ReactElement } from "react";
import { SourceTabs } from "../code/SourceTabs";
import { BasicCrud } from "../examples/BasicCrud";
import { ClipboardArray } from "../examples/ClipboardArray";
import { RejectedDrift } from "../examples/RejectedDrift";
import { Outliner } from "../examples/Outliner";

import basicSrc from "../examples/BasicCrud.tsx?raw";
import clipboardSrc from "../examples/ClipboardArray.tsx?raw";
import rejectSrc from "../examples/RejectedDrift.tsx?raw";
import outlinerSrc from "../examples/Outliner.tsx?raw";

type Example = {
  key: string;
  label: string;
  blurb: string;
  filename: string;
  source: string;
  Demo: () => ReactElement;
};

const examples: Example[] = [
  { key: "basic", label: "Basic CRUD", blurb: "update primitives, render via subscribe.", filename: "BasicCrud.tsx", source: basicSrc, Demo: BasicCrud },
  { key: "outliner", label: "Outliner (Workflowy)", blurb: "useJson + useFocus — recursive tree with Tab/Shift+Tab/Enter/Backspace.", filename: "Outliner.tsx", source: outlinerSrc, Demo: Outliner },
  { key: "clipboard", label: "Clipboard + history", blurb: "copy / cut / paste over an array, undo · redo.", filename: "ClipboardArray.tsx", source: clipboardSrc, Demo: ClipboardArray },
  { key: "reject", label: "Schema-rejected drift", blurb: "try a value the schema refuses — state stays untouched.", filename: "RejectedDrift.tsx", source: rejectSrc, Demo: RejectedDrift },
];

export function Examples() {
  const [activeKey, setActiveKey] = useState<string>(examples[0]!.key);
  const active = examples.find((e) => e.key === activeKey)!;
  const Demo = active.Demo;

  return (
    <main className="flex h-full min-h-0 flex-col">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="text-xs font-medium uppercase tracking-wider text-stone-400">Reference</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-900">Examples</h1>
        <p className="mt-1 text-sm text-stone-600">
          Each demo on the right runs the exact source on the left — code SSOT, never a stale copy.
        </p>
      </header>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="shrink-0 border-stone-200 bg-stone-50 md:h-full md:w-64 md:overflow-y-auto md:border-r">
          <div className="flex flex-col gap-1 p-3">
            {examples.map((ex) => {
              const current = ex.key === activeKey;
              return (
                <button
                  key={ex.key}
                  onClick={() => setActiveKey(ex.key)}
                  aria-current={current ? "page" : undefined}
                  className="flex flex-col items-start rounded px-2 py-2 text-left hover:bg-stone-200 aria-[current=page]:bg-stone-900 aria-[current=page]:text-stone-50"
                >
                  <span className="text-sm font-medium">{ex.label}</span>
                  <span className="text-xs text-stone-500 group-aria-[current=page]:text-stone-300 aria-[current=page]:text-stone-300">{ex.blurb}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex flex-1 min-h-0 flex-col gap-4 p-4 md:flex-row md:overflow-hidden">
          <div className="flex flex-1 min-h-0 flex-col rounded-md border border-stone-200 bg-stone-50 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500">Live</div>
            <Demo />
          </div>
          <div className="flex flex-1 min-h-0">
            <SourceTabs
              key={active.key}
              tabs={[{ key: active.key, label: active.filename, filename: active.filename, source: active.source }]}
              filenamePrefix="apps/site/src/examples/"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
