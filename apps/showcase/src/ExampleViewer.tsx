import { ExampleListbox } from "./examples/ExampleListbox.js";
import { ExampleTreeGrid } from "./examples/ExampleTreeGrid.js";
import listboxSource from "./examples/ExampleListbox.tsx?raw";
import treegridSource from "./examples/ExampleTreeGrid.tsx?raw";

export function ExampleViewer() {
  return (
    <section className="example-viewer">
      <h2>Examples — zod + zod-crud + @p/aria-kernel</h2>

      <article className="example-card">
        <header>
          <h3>Listbox (zod enum + zod-crud update)</h3>
        </header>
        <div className="example-live">
          <ExampleListbox />
        </div>
        <pre className="example-source">
          <code>{listboxSource}</code>
        </pre>
      </article>

      <article className="example-card">
        <header>
          <h3>TreeGrid (zod-crud doc + headless useTreeGridPattern)</h3>
        </header>
        <div className="example-live">
          <ExampleTreeGrid />
        </div>
        <pre className="example-source">
          <code>{treegridSource}</code>
        </pre>
      </article>
    </section>
  );
}
