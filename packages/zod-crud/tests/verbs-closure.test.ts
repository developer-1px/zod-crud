// P8.2 — verbs/ 10개 closure 자동 검증.
// 4대 기둥 ↔ 10 verbs 매핑이 코드와 정합하는지 확인.
import { describe, expect, test } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const verbsPath = resolve(root, "src/verbs");

// 4대 기둥 ↔ 10 verbs (SPEC §0.1 / ADR-0002)
const expectedVerbs = [
  "select",     // Selection
  "find",       // Selection
  "move",       // Edit
  "duplicate",  // Edit
  "replace",    // Edit
  "cut",        // Clipboard
  "copy",       // Clipboard
  "paste",      // Clipboard
  "undo",       // Undo
  "redo",       // Undo
];

describe("verbs/ closure — 10 verbs ↔ 파일 1:1", () => {
  test("expected 10 verb 파일이 모두 존재", () => {
    expect(expectedVerbs.length).toBe(10);
    for (const v of expectedVerbs) {
      expect(existsSync(resolve(verbsPath, `${v}.ts`)), `missing: verbs/${v}.ts`).toBe(true);
    }
  });

  test("verbs/ 에 10개 + README.md 외 추가 파일 없음 (closure 보존)", () => {
    const actual = readdirSync(verbsPath).filter((n) => n.endsWith(".ts") || n.endsWith(".md"));
    const tsFiles = actual.filter((n) => n.endsWith(".ts"));
    expect(tsFiles.length).toBe(10);
    for (const f of tsFiles) {
      const verb = f.replace(/\.ts$/, "");
      expect(expectedVerbs.includes(verb), `verbs/${f} 가 4대 기둥 매핑에 없음`).toBe(true);
    }
  });

  test("public API 가 10 verbs 모두 *Verb suffix 로 노출", async () => {
    const pkg = await import("../src/index.js");
    for (const v of expectedVerbs) {
      const exportName = v + "Verb";
      // selectVerb, moveVerb, ..., undoVerb, redoVerb
      expect(exportName in pkg, `index.ts missing ${exportName} export`).toBe(true);
    }
  });
});
