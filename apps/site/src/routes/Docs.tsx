import { useMemo } from "react";
import { MarkdownViewer, markdownHeadings } from "../components/MarkdownViewer";
import apiReferenceMarkdown from "../docs/zod-crud-api.md?raw";

export function Docs() {
  const headings = useMemo(
    () => markdownHeadings(apiReferenceMarkdown).filter((heading) => heading.level <= 2),
    [],
  );

  return (
    <main className="min-h-full bg-stone-50">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-4 text-xs">
            <div className="mb-2 font-semibold uppercase tracking-wide text-stone-400">On this page</div>
            <div className="grid gap-1">
              {headings.map((heading) => (
                <a
                  key={`${heading.id}-${heading.text}`}
                  href={`#${heading.id}`}
                  className="rounded px-2 py-1 text-stone-600 no-underline hover:bg-stone-100 hover:text-stone-950"
                >
                  {heading.text}
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 border-b border-stone-200 pb-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-400">Reference</p>
            <h1 className="mb-0 mt-1 text-2xl font-semibold text-stone-950">zod-crud API</h1>
          </div>
          <div className="rounded border border-stone-200 bg-white p-4">
            <MarkdownViewer source={apiReferenceMarkdown} />
          </div>
        </div>
      </div>
    </main>
  );
}
