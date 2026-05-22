import { useMemo, type ReactNode } from "react";

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; language: string; code: string };

export function MarkdownViewer({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  return (
    <article className="grid gap-4 text-sm text-stone-700">
      {blocks.map((block, index) => (
        <MarkdownBlockView key={`${block.type}-${index}`} block={block} />
      ))}
    </article>
  );
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.type === "heading") {
    const HeadingTag = (block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4") as "h2" | "h3" | "h4";
    const className = block.level === 1
      ? "mb-0 mt-0 text-base font-semibold text-stone-900"
      : block.level === 2
        ? "mb-0 mt-2 border-t border-stone-200 pt-4 text-sm font-semibold text-stone-900"
        : "mb-0 mt-1 text-xs font-semibold uppercase tracking-wide text-stone-500";

    return (
      <HeadingTag className={className}>
        <InlineMarkdown text={block.text} />
      </HeadingTag>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p className="m-0 max-w-3xl leading-6 text-stone-600">
        <InlineMarkdown text={block.text} />
      </p>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="m-0 max-w-3xl list-disc pl-5 text-sm leading-6 text-stone-600">
        {block.items.map((item) => (
          <li key={item}>
            <InlineMarkdown text={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
          <thead>
            <tr>
              {block.header.map((cell) => (
                <th key={cell} className="border-b border-stone-200 py-1.5 pr-3 font-semibold text-stone-700">
                  <InlineMarkdown text={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cellIndex}-${cell}`} className="border-b border-stone-100 py-1.5 pr-3 align-top text-stone-600">
                    <InlineMarkdown text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="m-0 overflow-x-auto rounded bg-stone-950 p-3 text-[11px] leading-relaxed text-stone-100">
      <code>{block.code}</code>
    </pre>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(
      <code key={`${match.index}-${match[1]}`} className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] text-stone-800">
        {match[1]}
      </code>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", language, code: code.join("\n") });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]?.length ?? 1, text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").trim();
        if (!item.startsWith("- ")) break;
        items.push(item.slice(2).trim());
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length) {
        const tableLine = (lines[index] ?? "").trim();
        if (!tableLine.startsWith("|")) break;
        const cells = tableLine
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      const [header, ...body] = rows;
      if (header) blocks.push({ type: "table", header, rows: body });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index] ?? "";
      const paragraphTrimmed = paragraphLine.trim();
      if (
        paragraphTrimmed === ""
        || paragraphTrimmed.startsWith("```")
        || paragraphTrimmed.startsWith("- ")
        || paragraphTrimmed.startsWith("|")
        || /^(#{1,3})\s+/.test(paragraphTrimmed)
      ) {
        break;
      }
      paragraph.push(paragraphTrimmed);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}
