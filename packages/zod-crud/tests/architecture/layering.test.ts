// 내부 레이어링 invariant — 의존은 아래로만 흐른다.
//
//   index.ts / react.ts (public barrel)
//        └─▶ application  └─▶ domain  └─▶ foundation
//
// 한 층은 자기보다 아래 층만 import 한다. 위로 향하는 import(역방향)나
// 순환은 금지. foundation 은 schema-무관 RFC/JSON 원시라 domain/application 을
// 절대 모른다. 이 테스트가 깨지면 로직이 잘못된 층에 새로 들어온 것.

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const srcRoot = resolve(__dirname, "..", "..", "src");

const LAYER_RANK: Record<string, number> = {
  foundation: 0,
  domain: 1,
  application: 2,
};
// src 직속 파일(index.ts·react.ts)은 public barrel — 최상위라 어느 층이든 import 가능.
const BARREL_RANK = 3;

function layerOf(absPath: string): { name: string; rank: number } {
  const rel = relative(srcRoot, absPath);
  const [head] = rel.split("/");
  if (head !== undefined && head in LAYER_RANK) {
    return { name: head, rank: LAYER_RANK[head]! };
  }
  return { name: "barrel", rank: BARREL_RANK };
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const IMPORT_FROM = /(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const BARE_IMPORT = /\bimport\s*["']([^"']+)["']/g;

function relativeSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const re of [IMPORT_FROM, BARE_IMPORT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1]!;
      if (spec.startsWith(".")) specs.push(spec);
    }
  }
  return specs;
}

const files = listTsFiles(srcRoot);

describe("internal layering — downward-only dependencies", () => {
  test("src has the expected three layers", () => {
    const layers = new Set(files.map((f) => layerOf(f).name));
    expect(layers).toContain("foundation");
    expect(layers).toContain("domain");
    expect(layers).toContain("application");
  });

  test("no module imports a layer above itself", () => {
    const violations: string[] = [];
    for (const file of files) {
      const from = layerOf(file);
      const source = readFileSync(file, "utf8");
      for (const spec of relativeSpecifiers(source)) {
        const target = layerOf(resolve(dirname(file), spec));
        if (target.rank > from.rank) {
          violations.push(
            `${relative(srcRoot, file)} (${from.name}) → ${spec} (${target.name})`,
          );
        }
      }
    }
    expect(violations, `upward imports:\n${violations.join("\n")}`).toEqual([]);
  });

  test("foundation depends on nothing internal above it", () => {
    const violations: string[] = [];
    for (const file of files.filter((f) => layerOf(f).name === "foundation")) {
      const source = readFileSync(file, "utf8");
      for (const spec of relativeSpecifiers(source)) {
        const target = layerOf(resolve(dirname(file), spec));
        if (target.name === "domain" || target.name === "application") {
          violations.push(`${relative(srcRoot, file)} → ${spec} (${target.name})`);
        }
      }
    }
    expect(violations, `foundation leaks:\n${violations.join("\n")}`).toEqual([]);
  });

  test("domain never reaches into application", () => {
    const violations: string[] = [];
    for (const file of files.filter((f) => layerOf(f).name === "domain")) {
      const source = readFileSync(file, "utf8");
      for (const spec of relativeSpecifiers(source)) {
        const target = layerOf(resolve(dirname(file), spec));
        if (target.name === "application") {
          violations.push(`${relative(srcRoot, file)} → ${spec}`);
        }
      }
    }
    expect(violations, `domain → application:\n${violations.join("\n")}`).toEqual([]);
  });
});
