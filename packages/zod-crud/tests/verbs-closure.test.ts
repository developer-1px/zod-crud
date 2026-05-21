// P8.2 — command verbs closure 자동 검증.
// 4대 기둥 ↔ 10 command verbs 매핑이 코드와 정합하는지 확인.
import { describe, expect, test } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const verbsPath = resolve(root, "src/verbs");

// 4대 기둥 ↔ 10 command verbs (SPEC §0.1 / ADR-0002)
const commandVerbs = [
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

const pureVerbFiles = [
  "select",
  "find",
  "move",
  "duplicate",
  "replace",
  "cut",
  "copy",
  "paste",
];

describe("verbs/ closure — pure composers only", () => {
  test("expected pure verb 파일이 모두 존재", () => {
    expect(pureVerbFiles.length).toBe(8);
    for (const v of pureVerbFiles) {
      expect(existsSync(resolve(verbsPath, `${v}.ts`)), `missing: verbs/${v}.ts`).toBe(true);
    }
  });

  test("verbs/ 에 pure verb 파일 + README.md 외 추가 파일 없음 (closure 보존)", () => {
    const actual = readdirSync(verbsPath).filter((n) => n.endsWith(".ts") || n.endsWith(".md"));
    const tsFiles = actual.filter((n) => n.endsWith(".ts"));
    expect(tsFiles.length).toBe(8);
    for (const f of tsFiles) {
      const verb = f.replace(/\.ts$/, "");
      expect(pureVerbFiles.includes(verb), `verbs/${f} 가 pure verb 매핑에 없음`).toBe(true);
    }
  });

  test("Commands<T> interface 가 10 command verbs 를 method 로 노출", async () => {
    // *Verb suffix re-export 는 v0.10 에서 제거됨 (doubt sweep — 외부 사용 0).
    // closure 는 이제 buildCommands 의 Commands<T> interface 로 검증.
    const fs = await import("node:fs");
    const src = fs.readFileSync(resolve(root, "src/commands/buildCommands.ts"), "utf-8");
    for (const v of commandVerbs) {
      // method 시그니처 (ex. `cut(source: ClipboardSource)`)
      const reMethod = new RegExp(`^\\s*${v}\\s*\\(`, "m");
      expect(reMethod.test(src), `Commands<T> missing method ${v}`).toBe(true);
    }
  });

  test("verbs/ modules do not runtime-import other verbs", async () => {
    const fs = await import("node:fs");
    for (const f of pureVerbFiles.map((v) => `${v}.ts`)) {
      const src = fs.readFileSync(resolve(verbsPath, f), "utf-8");
      expect(
        /^import\s+(?!type\b)[^;]+from\s+["']\.\/[^"']+["']/m.test(src),
        `verbs/${f} must not runtime-import another verb`,
      ).toBe(false);
    }
  });
});
