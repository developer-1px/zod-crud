import type { SourceReference } from "./source-references";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; lang: string; source: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "blockquote"; text: string }
  | { kind: "source"; reference: SourceReference };

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }

    const source = parseSourceDirective(line);
    if (source) {
      blocks.push({ kind: "source", reference: source });
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      i++;
      continue;
    }

    const fence = /^```([a-zA-Z0-9_-]*)\s*$/.exec(line);
    if (fence) {
      const sourceLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        sourceLines.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ kind: "code", lang: fence[1] ?? "", source: sourceLines.join("\n") });
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitTableRow(lines[i]!);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        rows.push(splitTableRow(lines[i] ?? ""));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quoteLines.push((lines[i] ?? "").replace(/^>\s?/, "").trim());
        i++;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^-\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "list", ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "list", ordered: true, items });
      continue;
    }

    const paragraphLines = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i]?.trim() !== "" &&
      !/^(#{1,3})\s+/.test(lines[i] ?? "") &&
      !/^```/.test(lines[i] ?? "") &&
      !isTableStart(lines, i) &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !/^-\s+/.test(lines[i] ?? "") &&
      !/^\d+\.\s+/.test(lines[i] ?? "") &&
      !parseSourceDirective(lines[i] ?? "")
    ) {
      paragraphLines.push((lines[i] ?? "").trim());
      i++;
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function isTableStart(lines: string[], index: number): boolean {
  return isTableRow(lines[index] ?? "") && isTableSeparator(lines[index + 1] ?? "");
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && splitTableRow(trimmed).length > 1;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseSourceDirective(line: string): SourceReference | null {
  const match = /^::source\{(.+)\}\s*$/.exec(line.trim());
  if (!match) return null;

  const attrs = parseAttributes(match[1]!);
  const path = attrs.path;
  const lines = attrs.lines ?? attrs.loc;

  if (!path || !lines) {
    throw new Error("Source directive requires path and lines");
  }

  return {
    path,
    lines,
    title: attrs.title,
    height: attrs.height ? Number(attrs.height) : undefined,
  };
}

function parseAttributes(input: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input))) {
    attrs[match[1]!] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attrs;
}
