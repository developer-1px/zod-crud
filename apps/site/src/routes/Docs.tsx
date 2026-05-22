import { useMemo } from "react";
import { MarkdownViewer, markdownHeadings } from "../components/MarkdownViewer";
import apiReferenceMarkdown from "../docs/zod-crud-api.md?raw";
import conceptsMarkdown from "../docs/zod-crud-concepts.md?raw";
import tutorialMarkdown from "../docs/zod-crud-tutorial.md?raw";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

const docPages = [
  {
    path: "/docs",
    label: "Concepts",
    eyebrow: "Guide",
    title: "zod-crud Docs",
    source: conceptsMarkdown,
  },
  {
    path: "/docs/tutorial",
    label: "Tutorial",
    eyebrow: "Tutorial",
    title: "작은 카드 편집기 만들기",
    source: tutorialMarkdown,
  },
  {
    path: "/docs/api",
    label: "API reference",
    eyebrow: "Reference",
    title: "zod-crud API",
    source: apiReferenceMarkdown,
  },
] as const;

type DocPage = (typeof docPages)[number];

function sitePath(path: string): string {
  return `${BASE_PATH}${path}` || "/";
}

export function Docs() {
  return <DocsPage page={docPages[0]} />;
}

export function DocsTutorial() {
  return <DocsPage page={docPages[1]} />;
}

export function DocsApiReference() {
  return <DocsPage page={docPages[2]} />;
}

function DocsPage({ page }: { page: DocPage }) {
  const headings = useMemo(
    () => markdownHeadings(page.source).filter((heading) => heading.level <= 2),
    [page.source],
  );

  return (
    <main className="min-h-full bg-stone-50">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-4 text-xs">
            <nav aria-label="Documentation pages">
              <div className="mb-2 font-semibold uppercase tracking-wide text-stone-400">Docs</div>
              <div className="grid gap-1">
                {docPages.map((item) => (
                  <a
                    key={item.path}
                    href={sitePath(item.path)}
                    aria-current={item.path === page.path ? "page" : undefined}
                    className="rounded px-2 py-1 text-stone-600 no-underline hover:bg-stone-100 hover:text-stone-950 aria-[current=page]:bg-stone-950 aria-[current=page]:text-white"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </nav>

            <nav aria-label="On this page" className="mt-5">
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
          </div>
        </aside>

        <div className="min-w-0">
          <nav aria-label="Documentation pages" className="mb-3 overflow-x-auto rounded border border-stone-200 bg-white p-2 text-xs lg:hidden">
            <div className="flex gap-1 whitespace-nowrap">
              {docPages.map((item) => (
                <a
                  key={item.path}
                  href={sitePath(item.path)}
                  aria-current={item.path === page.path ? "page" : undefined}
                  className="rounded px-2 py-1 text-stone-600 no-underline hover:bg-stone-100 hover:text-stone-950 aria-[current=page]:bg-stone-950 aria-[current=page]:text-white"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <nav aria-label="Documentation sections" className="mb-4 overflow-x-auto rounded border border-stone-200 bg-white p-2 text-xs lg:hidden">
            <div className="flex gap-1 whitespace-nowrap">
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

          <div className="mb-5 border-b border-stone-200 pb-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-stone-400">{page.eyebrow}</p>
            <h1 className="mb-0 mt-1 text-2xl font-semibold text-stone-950">{page.title}</h1>
          </div>
          <div className="rounded border border-stone-200 bg-white p-4">
            <MarkdownViewer source={page.source} />
          </div>
        </div>
      </div>
    </main>
  );
}
