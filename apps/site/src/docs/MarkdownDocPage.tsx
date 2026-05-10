import { useMemo, type ReactNode } from "react";

import { SourceTabs } from "../code/SourceTabs";
import type { DocsPage } from "./docs-pages";
import { parseMarkdown, type MarkdownBlock } from "./markdown";
import { resolveSourceReference } from "./source-references";

export function MarkdownDocPage({ page }: { page: DocsPage }) {
  const blocks = useMemo(() => parseMarkdown(page.markdown), [page.markdown]);

  return (
    <main className="mx-auto w-full max-w-3xl bg-white p-8">
      <article className="prose-doc">
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
      <div className="source-block" style={fixedHeight ? { height: block.reference.height } : undefined}>
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
      <div className="rounded-md border border-red-200 bg-red-50 p-4 font-mono text-sm text-red-800">
        {message}
      </div>
    );
  }
}

function renderProseBlock(block: Exclude<MarkdownBlock, { kind: "source" }>) {
  switch (block.kind) {
    case "heading":
      if (block.level === 1) return <h1>{renderInline(block.text)}</h1>;
      if (block.level === 2) return <h2>{renderInline(block.text)}</h2>;
      return <h3>{renderInline(block.text)}</h3>;
    case "paragraph":
      return <p>{renderInline(block.text)}</p>;
    case "code":
      return (
        <pre>
          <code>{block.source}</code>
        </pre>
      );
    case "list":
      if (block.ordered) {
        return (
          <ol>
            {block.items.map((item) => (
              <li key={item}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header}>{renderInline(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {block.headers.map((_, cellIndex) => (
                    <td key={cellIndex}>{renderInline(row[cellIndex] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "blockquote":
      return <blockquote>{renderInline(block.text)}</blockquote>;
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
      parts.push(<code key={match.index}>{match[2]}</code>);
    } else if (match[3]) {
      parts.push(<strong key={match.index}>{match[3]}</strong>);
    } else if (match[4] && match[5]) {
      parts.push(
        <a key={match.index} href={match[5]}>
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
