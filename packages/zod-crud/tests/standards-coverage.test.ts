// P8.1 — RFC ↔ core/* 1:1 매핑 자동 검증.
// STANDARDS.md 의 표 ↔ src/core/ 디렉터리 일치 확인.
import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const corePath = resolve(root, "src/core");

const expectedCoreFolders = [
  "pointer",     // RFC 6901
  "patch",       // RFC 6902
  "jsonpath",    // RFC 9535
  "selection",   // W3C Selection + WAI-ARIA
  "schema",      // RFC 8927 + Zod
];

const expectedCoreFiles = [
  "json.ts",     // RFC 8259 JSON value boundary
  "track.ts",    // RFC 6902 op 적용 후 Pointer follow (인프라)
  "history.ts",  // RFC 6902 inverse + history stack (pure reducer)
];

describe("STANDARDS.md ↔ core/* 1:1 매핑", () => {
  test("expected core/ 폴더가 모두 존재", () => {
    for (const dir of expectedCoreFolders) {
      const p = resolve(corePath, dir);
      expect(existsSync(p), `missing: core/${dir}`).toBe(true);
      expect(statSync(p).isDirectory()).toBe(true);
    }
  });

  test("expected core/ 파일이 모두 존재", () => {
    for (const f of expectedCoreFiles) {
      expect(existsSync(resolve(corePath, f)), `missing: core/${f}`).toBe(true);
    }
  });

  test("core/ 에 STANDARDS.md 미등재 폴더 없음 (정합 근거 없는 substrate 거부)", () => {
    const actual = readdirSync(corePath, { withFileTypes: true });
    for (const e of actual) {
      if (e.isDirectory()) {
        expect(
          expectedCoreFolders.includes(e.name),
          `core/${e.name} 가 STANDARDS.md 표에 없음 — 표 갱신 또는 폴더 제거`,
        ).toBe(true);
      } else if (e.name.endsWith(".ts")) {
        expect(
          expectedCoreFiles.includes(e.name),
          `core/${e.name} 가 STANDARDS.md 표에 없음`,
        ).toBe(true);
      }
    }
  });

  test("README conflict policy matches SPEC §11", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const spec = readFileSync(resolve(root, "SPEC.md"), "utf8");

    expect(readme).not.toContain("outranks code");
    expect(readme).toContain("SPEC §11 applies");
    expect(readme).toContain("code behavior wins unless it");
    expect(readme).toContain("conflicts with an RFC");
    expect(spec).toContain("현재 코드 동작이 이긴다");
    expect(spec).toContain("RFC가 이긴다");
  });
});
