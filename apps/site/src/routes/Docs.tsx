import { MarkdownViewer } from "../components/MarkdownViewer";
import apiReferenceMarkdown from "../docs/zod-crud-api.md?raw";

export function Docs() {
  return (
    <main className="min-h-full bg-stone-50 p-4">
      <section className="mx-auto max-w-5xl rounded border border-stone-200 bg-white p-4">
        <div className="mb-5 border-b border-stone-200 pb-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-400">Reference</p>
          <h1 className="mb-0 mt-1 text-2xl font-semibold text-stone-950">zod-crud API</h1>
        </div>
        <MarkdownViewer source={apiReferenceMarkdown} />
      </section>
    </main>
  );
}
