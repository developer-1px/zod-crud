const modelRows = [
  ["document", "value, patch, duplicate, read/query"],
  ["selection", "anchor, focus, ranges, text plans"],
  ["clipboard", "copy, cut, paste, payload insertion"],
  ["history", "undo, redo, transaction metadata"],
  ["can*", "reasoned checks for UI and tests"],
] as const;

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

function sitePath(path: string): string {
  return `${BASE_PATH}${path}` || "/";
}

export function Home() {
  return (
    <main className="min-h-full bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:py-14">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-400">
              Zod-guarded JSON editing
            </p>
            <h1 className="mb-4 mt-2 text-4xl font-semibold tracking-normal text-stone-950">
              zod-crud
            </h1>
            <p className="m-0 max-w-2xl text-base leading-7 text-stone-600">
              A headless document facade for JSON Patch, JSON Pointer, JSONPath,
              selection, clipboard, history, and reasoned capability checks.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <a className="rounded bg-stone-950 px-3 py-2 text-sm font-medium text-white no-underline hover:bg-stone-800" href={sitePath("/docs")}>
                Docs
              </a>
              <a className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 no-underline hover:bg-stone-100" href={sitePath("/docs/api")}>
                API reference
              </a>
              <a className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 no-underline hover:bg-stone-100" href={sitePath("/playground")}>
                Workbench
              </a>
              <a className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 no-underline hover:bg-stone-100" href="https://www.npmjs.com/package/zod-crud">
                npm
              </a>
              <a className="rounded border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 no-underline hover:bg-stone-100" href="https://github.com/developer-1px/zod-crud">
                GitHub
              </a>
            </div>
          </div>

          <div className="rounded border border-stone-200 bg-stone-950 p-3 text-stone-100">
            <div className="mb-2 text-xs font-medium text-stone-400">Install</div>
            <pre className="m-0 overflow-x-auto text-sm leading-6"><code>npm install zod-crud zod</code></pre>
            <div className="mt-4 border-t border-stone-800 pt-3 text-xs font-medium text-stone-400">Start</div>
            <pre className="m-0 mt-2 overflow-x-auto text-sm leading-6"><code>{`import { createJSONDocument } from "zod-crud";`}</code></pre>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <h2 className="mb-3 mt-0 text-base font-semibold text-stone-950">Public model</h2>
          <div className="overflow-x-auto rounded border border-stone-200 bg-white">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-stone-200 px-3 py-2 font-semibold text-stone-700">Surface</th>
                  <th className="border-b border-stone-200 px-3 py-2 font-semibold text-stone-700">Responsibility</th>
                </tr>
              </thead>
              <tbody>
                {modelRows.map(([surface, responsibility]) => (
                  <tr key={surface}>
                    <td className="border-b border-stone-100 px-3 py-2 font-mono text-xs text-stone-900">{surface}</td>
                    <td className="border-b border-stone-100 px-3 py-2 text-stone-600">{responsibility}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded border border-stone-200 bg-white p-4">
          <h2 className="mb-3 mt-0 text-base font-semibold text-stone-950">Boundary</h2>
          <ul className="m-0 grid gap-2 p-0 text-sm text-stone-600 [list-style:none]">
            <li>Root package is React-free.</li>
            <li>React lives under <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-xs">zod-crud/react</code>.</li>
            <li>Mutation inputs are JSON Patch with JSON Pointer paths.</li>
            <li>JSONPath is search-only and returns pointers.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
