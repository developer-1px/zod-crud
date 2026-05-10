import { useMemo, type ReactNode } from "react";

import { SourceTabs } from "../code/SourceTabs";
import type { DocsPage } from "./docs-pages";
import { parseMarkdown, type MarkdownBlock } from "./markdown";
import { resolveSourceReference } from "./source-references";

const cls = {
  h1: "text-3xl font-bold mb-6 mt-0",
  h2: "text-xl font-semibold mt-10 mb-3 pb-2 border-b border-stone-200",
  h3: "text-base font-semibold mt-6 mb-2",
  p: "my-3 leading-relaxed",
  ul: "my-3 pl-6 list-disc",
  ol: "my-3 pl-6 list-decimal",
  li: "my-1",
  pre: "bg-stone-900 text-stone-100 rounded p-4 overflow-x-auto my-4 text-xs leading-relaxed font-mono",
  inlineCode: "font-mono text-[0.9em] bg-stone-100 px-1 rounded",
  a: "underline underline-offset-2 decoration-stone-400 hover:decoration-stone-900",
  blockquote: "border-l-2 border-stone-300 pl-3 my-4 text-stone-600",
  table: "w-full text-sm border-collapse",
  th: "text-left p-2 border-b border-stone-200 font-medium bg-stone-50",
  td: "p-2 border-b border-stone-200 align-top",
};

export function MarkdownDocPage({ page }: { page: DocsPage }) {
  const blocks = useMemo(() => parseMarkdown(page.markdown), [page.markdown]);

  return (
    <main className="mx-auto w-full max-w-3xl p-8 text-stone-800">
      <article>
        {blocks.map((block, index) => (
          <MarkdownBlockView block={block} key={index} />
        ))}
      </article>
    </main>
  );
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.kind === "source") {
    return <SourceBlock block={block} />;
  }

  return renderProseBlock(block);
}

function SourceBlock({ block }: { block: Extract<MarkdownBlock, { kind: "source" }> }) {
  try {
    const tab = resolveSourceReference(block.reference);
    const fixedHeight = block.reference.height !== undefined;
    return (
      <div className="my-5" style={fixedHeight ? { height: block.reference.height } : undefined}>
        <SourceTabs
          tabs={[tab]}
          filenamePrefix={sourcePrefix(block.reference.path)}
          fitContent={!fixedHeight}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown source reference error";
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 font-mono text-sm text-red-800">
        {message}
      </div>
    );
  }
}

function renderProseBlock(block: Exclude<MarkdownBlock, { kind: "source" }>) {
  switch (block.kind) {
    case "heading":
      if (block.level === 1) return <h1 className={cls.h1}>{renderInline(block.text)}</h1>;
      if (block.level === 2) return <h2 className={cls.h2}>{renderInline(block.text)}</h2>;
      return <h3 className={cls.h3}>{renderInline(block.text)}</h3>;
    case "paragraph":
      return <p className={cls.p}>{renderInline(block.text)}</p>;
    case "code":
      return (
        <pre className={cls.pre}>
          <code>{block.source}</code>
        </pre>
      );
    case "list":
      if (block.ordered) {
        return (
          <ol className={cls.ol}>
            {block.items.map((item) => (
              <li key={item} className={cls.li}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul className={cls.ul}>
          {block.items.map((item) => (
            <li key={item} className={cls.li}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="my-4 overflow-x-auto">
          <table className={cls.table}>
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header} className={cls.th}>{renderInline(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {block.headers.map((_, cellIndex) => (
                    <td key={cellIndex} className={cls.td}>{renderInline(row[cellIndex] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "blockquote":
      return <blockquote className={cls.blockquote}>{renderInline(block.text)}</blockquote>;
  }
}

function renderInline(text: string) {
  const parts: ReactNode[] = [];
  const pattern = /(`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > index) parts.push(text.slice(index, match.index));
    if (match[2]) {
      parts.push(<code key={match.index} className={cls.inlineCode}>{match[2]}</code>);
    } else if (match[3]) {
      parts.push(<strong key={match.index} className="font-semibold">{match[3]}</strong>);
    } else if (match[4] && match[5]) {
      parts.push(
        <a key={match.index} href={match[5]} className={cls.a}>
          {match[4]}
        </a>,
      );
    }
    index = match.index + match[0].length;
  }

  if (index < text.length) parts.push(text.slice(index));
  return parts;
}

function sourcePrefix(path: string): string {
  if (path.startsWith("packages/zod-crud/src/")) return "packages/zod-crud/src/";
  if (path.startsWith("apps/site/src/examples/")) return "apps/site/src/examples/";
  if (path.startsWith("apps/site/src/routes/")) return "apps/site/src/routes/";
  return "";
}
