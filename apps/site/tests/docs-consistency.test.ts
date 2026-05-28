import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const siteDocs = {
  concepts: read("apps/site/src/docs/zod-crud-concepts.md"),
  tutorial: read("apps/site/src/docs/zod-crud-tutorial.md"),
  api: read("apps/site/src/docs/zod-crud-api.md"),
};
const docs = {
  readme: read("packages/zod-crud/README.md"),
  spec: read("packages/zod-crud/SPEC.md"),
  site: Object.values(siteDocs).join("\n\n"),
  llms: read("llms.txt"),
};
const releaseNotes = read("docs/release/notes.md");
const apiUsageGaps = read("docs/adoption/api-usage-gaps.md");
const publicContract = JSON.parse(read("packages/zod-crud/public-contract.json")) as {
  root: { values: string[]; types: string[] };
  react: { values: string[]; types: string[] };
};
const publicExportNames = [...publicContract.root.values, ...publicContract.root.types];

describe("public docs consistency", () => {
  test("describe paste targets without legacy target aliases", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, name).not.toMatch(/\{\s*at\s*:/);
      expect(source, name).not.toMatch(/JSONDocumentPasteMode|PasteMode/);
      expect(source, name).not.toMatch(/\bUseJSONDocumentOptions\b|\bUseSelectionOptions\b/);
      expect(source, name).not.toMatch(/\bPasteOptions\b|\bPasteTarget\b/);
      expect(source, name).not.toMatch(/\bSelectionAction\b/);
      expect(source, name).not.toMatch(/\bCopyOk\b|\bCopyError\b|\bCutOk\b|\bCutError\b|\bDuplicateOk\b|\bDuplicateError\b|\bPasteError\b|\bPasteDiscriminatorMismatch\b/);
      expect(source, name).toMatch(/\{ after: pointer \}|\{ after: "\/items\/0" \}|\{ after: "\/lists\/0\/cards\/0" \}/);
    }

    expect(docs.readme).toMatch(/삽입 위치를 이미 알고 있으면 `\/items\/-`|`\/lists\/1\/cards\/-`/);
    expect(docs.site).toMatch(/이미 `\/cards\/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다/);
    expect(docs.llms).toMatch(/삽입 위치에는 `\/items\/-`/);
  });

  test("state that high-level mutating results are already applied", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, name).toMatch(/mutate|mutates|즉시 적용|적용됩니다/);
      expect(source, name).toMatch(/applied/);
      expect(source, name).toMatch(/다시 `commit`하지 않습니다|다시 `commit`하면 안 됩니다|다시 `commit`하지 않는다|다시 `commit`하면 안 된다/);
    }
  });

  test("keep JSONPath scoped to search and JSON Pointer scoped to mutation", () => {
    expect(docs.readme).toMatch(/JSONPath는 값을 찾는 언어이며 직접 변경하지 않습니다/);
    expect(docs.spec).toMatch(/JSONPath는 검색 언어/);
    expect(docs.site).toMatch(/JSONPath는 변경 언어가 아닙니다/);
    expect(docs.llms).toMatch(/JSONPath는 검색 전용/);
  });

  test("document onboarding context before the API reference", () => {
    expect(docs.site).toMatch(/## 배경/);
    expect(docs.site).toMatch(/## 핵심 개념/);
    expect(docs.site).toMatch(/튜토리얼: 작은 카드 편집기 만들기/);
    expect(docs.site).toMatch(/이걸로 할 수 있는 것들/);
    expect(docs.site).toMatch(/프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일/);
    expect(docs.site).toMatch(/검색: JSONPath -> Pointer\[\]/);
    expect(docs.readme).toMatch(/왜 zod-crud인가/);
    expect(docs.llms).toMatch(/왜 \/ 핵심 \/ 튜토리얼 맥락/);
  });

  test("keeps user-facing docs ahead of maintainer internals", () => {
    const conceptMaintainer = siteDocs.concepts.indexOf("## 관리자 메모");
    const apiMaintainer = siteDocs.api.indexOf("## 관리자 메모");
    const readmeMaintainer = docs.readme.indexOf("## 관리자 메모");

    expect(conceptMaintainer).toBeGreaterThan(siteDocs.concepts.indexOf("앱에서 하려는 일"));
    expect(siteDocs.concepts.indexOf("## 기본 사용 흐름")).toBeLessThan(conceptMaintainer);
    expect(siteDocs.api.indexOf("## 작업별 진입점")).toBeLessThan(apiMaintainer);
    expect(docs.readme.indexOf("## 작업별 진입점")).toBeLessThan(readmeMaintainer);
  });

  test("list the public root exports in human docs", () => {
    for (const name of publicExportNames) {
      expect(docs.readme, `README missing ${name}`).toContain(name);
      expect(docs.site, `site docs missing ${name}`).toContain(name);
      expect(docs.spec, `SPEC missing ${name}`).toContain(name);
    }
  });

  test("document release verification gates docs evaluation", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, `${name} missing docs:evaluate`).toContain("docs:evaluate");
      expect(source, `${name} missing release:check`).toContain("release:check");
    }
    expect(releaseNotes).toContain("docs:evaluate");
    expect(releaseNotes).toContain("release:check");
    expect(docs.spec).toContain("public-contract.json");
    expect(releaseNotes).toContain("public-contract.json");
    expect(docs.llms).toMatch(/prepublishOnly[\s\S]*release:check/);
    expect(releaseNotes).toMatch(/prepublishOnly[\s\S]*release:check/);
    expect(releaseNotes).toMatch(/`1\.0\.0` 패키지 버전|패키지 버전은 `1\.0\.0`/);
  });

  test("keeps legacy facade drift out of the 1.0 root contract", () => {
    expect(apiUsageGaps).not.toMatch(/\bP0\b/);
    expect(apiUsageGaps).not.toContain("Decision needed");
    expect(apiUsageGaps).toMatch(/zod-crud 1\.0 패키지 릴리스를 막는 미해결 외부 사용 gap은 없다/);
    expect(apiUsageGaps).toMatch(/G-001: `doc\.ops` facade drift[\s\S]*상태: zod-crud 1\.0 root 계약에서는 닫힘/);
    expect(apiUsageGaps).toMatch(/G-002: `doc\.commands` facade drift[\s\S]*상태: zod-crud 1\.0 root 계약에서는 닫힘/);
    expect(apiUsageGaps).toMatch(/프로덕션 root 계약에서 `doc\.ops`를 제외한다/);
    expect(apiUsageGaps).toMatch(/프로덕션 root 계약에서 `doc\.commands`를 제외한다/);
  });

  test("keeps internal source paths out of public docs", () => {
    for (const [name, source] of Object.entries(docs)) {
      for (const token of [
        "src/index.ts",
        "src/react.ts",
        "application/document",
        "domain/schema",
        "domain/selection",
        "domain/pointer",
        "foundation/patch",
        "foundation/json",
        "foundation/jsonpath",
        "foundation/pointer",
      ]) {
        expect(source, `${name} includes internal source path ${token}`).not.toContain(token);
      }
    }
  });

  test("document selection and history detail surfaces", () => {
    for (const [name, source] of Object.entries({ readme: docs.readme, site: docs.site, spec: docs.spec })) {
      expect(source, `${name} missing selection detail`).toMatch(/selectedPointers/);
      expect(source, `${name} missing selection text planning`).toMatch(/textPatch/);
      expect(source, `${name} missing selection restore`).toMatch(/restore\(snapshot\)|restore\(snapshot\)/);
      expect(source, `${name} missing history metadata`).toMatch(/mergeKey/);
      expect(source, `${name} missing mergeLast`).toMatch(/mergeLast/);
    }
  });

  test("keeps the can* family complete in public docs", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, `${name} missing canFind`).toContain("canFind");
    }
  });

  test("document performance fast-path boundaries", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, `${name} missing public applyPatch boundary`).toMatch(/applyPatch[\s\S]*외부 JSON 경계/);
      expect(source, `${name} missing trusted document state`).toMatch(/신뢰된 document state|trusted document state/);
      expect(source, `${name} missing plain structural schema`).toMatch(/구조만 가진 Zod schema/);
      expect(source, `${name} missing fast path operations`).toMatch(/independent non-root[\s\S]*`replace`[\s\S]*same-array `add`\/`remove`/);
      expect(source, `${name} missing full root validation fallback`).toMatch(/전체 루트 schema 검증/);
      expect(source, `${name} missing perf benchmark command`).toContain("npm run perf:core");
    }
  });

  test("documents blind outliner implementation gotchas", () => {
    expect(docs.readme).toMatch(/ReadResult/);
    expect(docs.site).toMatch(/결과 객체/);
    expect(docs.llms).toMatch(/ReadResult/);

    expect(docs.readme).toMatch(/doc\.commit\(\.\.\.\)[\s\S]*operation arrays/);
    expect(docs.site).toMatch(/`doc\.commit\(\.\.\.\)`과 `doc\.canPatch\(\.\.\.\)`는/);
    expect(docs.llms).toMatch(/doc\.commit\(\.\.\.\)[\s\S]*operation arrays/);
    expect(docs.readme).toMatch(/history\.transaction[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation으로 바꾸지는 않습니다/);
    expect(docs.site).toMatch(/history\.transaction[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation/);
    expect(docs.spec).toMatch(/알려진 burst edit[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation/);
    expect(docs.llms).toMatch(/Burst edit[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation/);

    expect(docs.readme).toMatch(/Pointer 배열을 copy\/cut하면 clipboard payload도 배열/);
    expect(docs.site).toMatch(/Pointer 배열을 copy하면 clipboard payload도 배열/);
    expect(docs.llms).toMatch(/Pointer array copy\/cut은 array payload/);

    expect(docs.readme).toMatch(/트리 편집 Cookbook/);
    expect(docs.site).toMatch(/트리 편집 cookbook/);
    expect(docs.llms).toMatch(/Tree semantics는 app-owned/);
  });
});
