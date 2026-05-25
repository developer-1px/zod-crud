import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

interface ImportEdge {
  from: string;
  to: string;
  kind: "type" | "value";
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function sourceRelative(path: string): string {
  return relative(srcRoot, path).replace(/\\/g, "/");
}

function resolveSourceImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const target = normalize(join(dirname(fromFile), specifier)).replace(/\\/g, "/");
  return target.endsWith(".js") ? target.slice(0, -3) + ".ts" : target + ".ts";
}

function owner(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "index.ts" || parts[0] === "react.ts") return parts[0];
  if (parts[0] === "application" && parts[1] === "document") {
    return parts.length <= 3 ? "application/document" : parts.slice(0, 3).join("/");
  }
  if (parts[0] === "domain") {
    return parts.length <= 2 ? "domain" : parts.slice(0, 3).join("/");
  }
  if (parts[0] === "foundation") {
    return parts.length <= 2 ? "foundation" : parts.slice(0, 3).join("/");
  }
  return parts[0] ?? path;
}

function importEdges(): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const importPattern = /\b(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const file of sourceFiles(srcRoot)) {
    const source = readFileSync(file, "utf8");
    const from = sourceRelative(file);
    for (const match of source.matchAll(importPattern)) {
      const target = resolveSourceImport(file, match[3]!);
      if (target === null || !target.startsWith(srcRoot)) continue;
      const to = sourceRelative(target);
      if (from === to) continue;
      edges.push({ from, to, kind: match[2] === undefined ? "value" : "type" });
    }
  }
  return edges;
}

function ownerMutuals(edges: readonly ImportEdge[]): string[] {
  const ownerEdges = new Map<string, ImportEdge[]>();
  for (const edge of edges) {
    const fromOwner = owner(edge.from);
    const toOwner = owner(edge.to);
    if (fromOwner === toOwner) continue;
    const key = `${fromOwner} -> ${toOwner}`;
    const current = ownerEdges.get(key) ?? [];
    current.push(edge);
    ownerEdges.set(key, current);
  }

  const mutuals: string[] = [];
  for (const [key, current] of ownerEdges) {
    const [fromOwner, toOwner] = key.split(" -> ");
    const reverseKey = `${toOwner} -> ${fromOwner}`;
    const reverse = ownerEdges.get(reverseKey);
    if (reverse === undefined || key > reverseKey) continue;
    mutuals.push([
      `${fromOwner} <-> ${toOwner}`,
      ...current.map((edge) => `  ${edge.from} -> ${edge.to} [${edge.kind}]`),
      ...reverse.map((edge) => `  ${edge.from} -> ${edge.to} [${edge.kind}]`),
    ].join("\n"));
  }
  return mutuals;
}

function fileCycles(edges: readonly ImportEdge[]): string[] {
  const files = new Set<string>();
  for (const edge of edges) {
    files.add(edge.from);
    files.add(edge.to);
  }
  const graph = new Map<string, string[]>();
  for (const file of files) graph.set(file, []);
  for (const edge of edges) graph.get(edge.from)?.push(edge.to);

  let nextIndex = 0;
  const stack: string[] = [];
  const indexes = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const cycles: string[] = [];

  function visit(file: string): void {
    indexes.set(file, nextIndex);
    lowlinks.set(file, nextIndex);
    nextIndex += 1;
    stack.push(file);
    onStack.add(file);

    for (const target of graph.get(file) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        lowlinks.set(file, Math.min(lowlinks.get(file)!, lowlinks.get(target)!));
      } else if (onStack.has(target)) {
        lowlinks.set(file, Math.min(lowlinks.get(file)!, indexes.get(target)!));
      }
    }

    if (lowlinks.get(file) !== indexes.get(file)) return;
    const component: string[] = [];
    let current: string | undefined;
    do {
      current = stack.pop();
      if (current === undefined) break;
      onStack.delete(current);
      component.push(current);
    } while (current !== file);
    if (component.length > 1) cycles.push(component.sort().join(" -> "));
  }

  for (const file of files) {
    if (!indexes.has(file)) visit(file);
  }
  return cycles;
}

describe("source import direction", () => {
  test("does not contain file cycles or mutual owner dependencies", () => {
    const edges = importEdges();

    expect(fileCycles(edges)).toEqual([]);
    expect(ownerMutuals(edges)).toEqual([]);
  });
});
