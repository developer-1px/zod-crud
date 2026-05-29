import { useMemo } from "react";
import { MarkdownViewer, markdownHeadings } from "../components/MarkdownViewer";
import apiReferenceMarkdown from "../../../../docs/public/api.md?raw";
import extensionsMarkdown from "../../../../docs/public/extensions.md?raw";
import overviewMarkdown from "../../../../docs/public/overview.md?raw";
import quickstartMarkdown from "../../../../docs/public/quickstart.md?raw";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

const docPages = [
  {
    path: "/docs",
    label: "Concepts",
    title: "zod-crud Docs",
    source: overviewMarkdown,
  },
  {
    path: "/docs/tutorial",
    label: "Quickstart",
    title: "작은 카드 편집기 만들기",
    source: quickstartMarkdown,
  },
  {
    path: "/docs/api",
    label: "API reference",
    title: "zod-crud API",
    source: apiReferenceMarkdown,
  },
  {
    path: "/docs/extensions",
    label: "Extensions",
    title: "zod-crud Extensions",
    source: extensionsMarkdown,
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

export function DocsExtensions() {
  return <DocsPage page={docPages[3]} />;
}

function DocsPage({ page }: { page: DocPage }) {
  const headings = useMemo(
    () => markdownHeadings(page.source).filter((heading) => heading.level === 2),
    [page.source],
  );

  return (
    <main className="min-h-full bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:px-6">
        <aside className="hidden self-start text-xs leading-5 lg:sticky lg:top-4 lg:flex">
          <div>
            <nav aria-label="Documentation pages">
              <div className="mb-2 font-medium text-stone-950">Docs</div>
              <div className="grid">
                {docPages.map((item) => (
                  <a
                    key={item.path}
                    href={sitePath(item.path)}
                    aria-current={item.path === page.path ? "page" : undefined}
                    className="border-l border-transparent px-3 py-1 text-stone-500 no-underline hover:text-stone-950 aria-[current=page]:border-stone-950 aria-[current=page]:font-medium aria-[current=page]:text-stone-950"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </nav>

            <nav aria-label="On this page" className="mt-6">
              <div className="mb-2 font-medium text-stone-950">On this page</div>
              <div className="grid">
                {headings.map((heading) => (
                  <a
                    key={`${heading.id}-${heading.text}`}
                    href={`#${heading.id}`}
                    className="border-l border-transparent px-3 py-1 text-stone-500 no-underline hover:text-stone-950"
                  >
                    {heading.text}
                  </a>
                ))}
              </div>
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          <nav aria-label="Documentation pages" className="mb-3 overflow-x-auto border-b border-stone-200 pb-2 text-xs lg:hidden">
            <div className="flex gap-1 whitespace-nowrap">
              {docPages.map((item) => (
                <a
                  key={item.path}
                  href={sitePath(item.path)}
                  aria-current={item.path === page.path ? "page" : undefined}
                  className="px-2 py-1 text-stone-500 no-underline hover:text-stone-950 aria-[current=page]:font-medium aria-[current=page]:text-stone-950"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          <nav aria-label="Documentation sections" className="mb-5 overflow-x-auto text-xs lg:hidden">
            <div className="flex gap-1 whitespace-nowrap">
              {headings.map((heading) => (
                <a
                  key={`${heading.id}-${heading.text}`}
                  href={`#${heading.id}`}
                  className="px-2 py-1 text-stone-500 no-underline hover:text-stone-950"
                >
                  {heading.text}
                </a>
              ))}
            </div>
          </nav>

          <div className="mx-auto max-w-3xl">
            <header className="mb-7 border-b border-stone-200 pb-4">
              <h1 className="m-0 text-2xl font-semibold text-stone-950">{page.title}</h1>
            </header>
            <MarkdownViewer source={page.source} hideTitle />
          </div>
        </div>
      </div>
    </main>
  );
}
