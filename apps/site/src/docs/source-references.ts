import type { SourceTab } from "../code/SourceTabs";

type RawModuleMap = Record<string, string>;

const packageSources = import.meta.glob("../../../../packages/zod-crud/src/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as RawModuleMap;

const sitePlaygroundSources = import.meta.glob("../playgrounds/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as RawModuleMap;

const siteRouteSources = import.meta.glob("../routes/**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as RawModuleMap;

const sources = new Map<string, string>();

for (const [path, source] of Object.entries(packageSources)) {
  sources.set(path.replace("../../../../", ""), source);
}

for (const [path, source] of Object.entries(sitePlaygroundSources)) {
  sources.set(path.replace("../", "apps/site/src/"), source);
}

for (const [path, source] of Object.entries(siteRouteSources)) {
  sources.set(path.replace("../", "apps/site/src/"), source);
}

export type SourceReference = {
  path: string;
  lines: string;
  title?: string;
  height?: number;
};

export function resolveSourceReference(reference: SourceReference): SourceTab {
  const source = sources.get(reference.path);
  if (source === undefined) {
    throw new Error(`Unknown source path: ${reference.path}`);
  }

  const allLines = source.split("\n");
  const range = parseLineRange(reference.lines, allLines.length);
  const selected = allLines.slice(range.start - 1, range.end).join("\n");

  return {
    key: `${reference.path}:${range.start}-${range.end}`,
    label: reference.title ?? basename(reference.path),
    filename: displayFilename(reference.path),
    source: selected,
    lineStart: range.start,
    lineEnd: range.end,
  };
}

function parseLineRange(value: string, maxLine: number): { start: number; end: number } {
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid source line range: ${value}`);
  }

  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > maxLine) {
    throw new Error(`Source line range ${value} is outside 1-${maxLine}`);
  }

  return { start, end };
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function displayFilename(path: string): string {
  if (path.startsWith("packages/zod-crud/src/")) {
    return path.slice("packages/zod-crud/src/".length);
  }
  if (path.startsWith("apps/site/src/playgrounds/")) {
    return path.slice("apps/site/src/playgrounds/".length);
  }
  if (path.startsWith("apps/site/src/routes/")) {
    return path.slice("apps/site/src/routes/".length);
  }
  return path;
}
