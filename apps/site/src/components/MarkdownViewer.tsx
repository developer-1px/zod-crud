import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

export type MarkdownHeading = { id: string; level: number; text: string };

export function MarkdownViewer({ source, hideTitle = false }: { source: string; hideTitle?: boolean }) {
  return (
    <article className="grid gap-4 text-[15px] text-stone-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          h1: ({ children, id }) => hideTitle
            ? null
            : <h2 id={id} className="mb-0 mt-0 text-lg font-semibold text-stone-950">{children}</h2>,
          h2: ({ children, id }) => (
            <h3 id={id} className="mb-0 mt-6 border-t border-stone-200 pt-5 text-base font-semibold text-stone-950 first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children, id }) => (
            <h4 id={id} className="mb-0 mt-2 text-sm font-medium text-stone-900">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="m-0 leading-7 text-stone-600">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="m-0 list-disc pl-5 leading-7 text-stone-600">{children}</ul>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-stone-200 py-1.5 pr-3 font-semibold text-stone-700">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-stone-100 py-1.5 pr-3 align-top text-stone-600">{children}</td>
          ),
          code: ({ children, className }) => {
            if (className) return <code>{children}</code>;
            return (
              <code className="rounded-sm bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-800">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="m-0 overflow-x-auto rounded-sm border border-stone-200 bg-stone-50 p-3 text-[12px] leading-relaxed text-stone-800">
              {children}
            </pre>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}

export function markdownHeadings(source: string): MarkdownHeading[] {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line): MarkdownHeading[] => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (!heading) return [];

      const text = stripInlineMarkdown(heading[2] ?? "");
      return [{ id: headingId(text), level: heading[1]?.length ?? 1, text }];
    });
}

function stripInlineMarkdown(text: string): string {
  return text.replace(/`([^`]+)`/g, "$1").trim();
}

function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    || "section";
}
