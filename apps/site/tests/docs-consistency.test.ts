import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const docs = {
  readme: read("packages/zod-crud/README.md"),
  spec: read("packages/zod-crud/SPEC.md"),
  site: [
    read("apps/site/src/docs/zod-crud-concepts.md"),
    read("apps/site/src/docs/zod-crud-tutorial.md"),
    read("apps/site/src/docs/zod-crud-api.md"),
  ].join("\n\n"),
  llms: read("llms.txt"),
};
const releaseNotes = read("docs/release-notes.md");

const publicExportNames = [
  "JSONCrudError",
  "createJSONDocument",
  "applyOperation",
  "applyPatch",
  "parsePointer",
  "tryParsePointer",
  "buildPointer",
  "escapeSegment",
  "unescapeSegment",
  "PointerSyntaxError",
  "parentPointer",
  "lastSegment",
  "lastSegmentIndex",
  "appendSegment",
  "withLastSegment",
  "trackPointer",
  "HistoryTransactionOptions",
  "JSONCapabilityResult",
  "JSONChangeMetadata",
  "JSONDocument",
  "JSONDocumentCommitOptions",
  "JSONDocumentDuplicateOptions",
  "JSONDocumentDuplicateResult",
  "JSONDocumentHistory",
  "JSONDocumentPasteOptions",
  "JSONDocumentPasteTarget",
  "JSONPatchInput",
  "JSONPatchOperation",
  "JSONResult",
  "Pointer",
  "JSONPoint",
  "SelectionAction",
  "SelectionRange",
  "SelectionSource",
  "SelectionSnap",
  "SelectionState",
];

describe("public docs consistency", () => {
  test("describe paste targets without legacy target aliases", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, name).not.toMatch(/\{\s*at\s*:/);
      expect(source, name).not.toMatch(/JSONDocumentPasteMode|PasteMode/);
      expect(source, name).toMatch(/\{ after: pointer \}|\{ after: "\/items\/0" \}|\{ after: "\/lists\/0\/cards\/0" \}/);
    }

    expect(docs.readme).toMatch(/Use a pointer such as `\/cards\/-`/);
    expect(docs.site).toMatch(/이미 `\/cards\/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다/);
    expect(docs.llms).toMatch(/Use a pointer for an insertion position/);
  });

  test("state that high-level mutating results are already applied", () => {
    for (const [name, source] of Object.entries(docs)) {
      expect(source, name).toMatch(/mutate|mutates|즉시 적용|적용됩니다/);
      expect(source, name).toMatch(/applied/);
      expect(source, name).toMatch(/do not pass|다시 `commit`하지 않습니다|Do not pass/);
    }
  });

  test("keep JSONPath scoped to search and JSON Pointer scoped to mutation", () => {
    expect(docs.readme).toMatch(/Use JSONPath to find values, not to mutate them directly/);
    expect(docs.spec).toMatch(/JSONPath is a search language/);
    expect(docs.site).toMatch(/JSONPath는 변경 언어가 아닙니다/);
    expect(docs.llms).toMatch(/JSONPath is for search only/);
  });

  test("document onboarding context before the API reference", () => {
    expect(docs.site).toMatch(/## 배경/);
    expect(docs.site).toMatch(/## Core concept/);
    expect(docs.site).toMatch(/튜토리얼: 작은 카드 편집기 만들기/);
    expect(docs.site).toMatch(/이걸로 할 수 있는 것들/);
    expect(docs.site).toMatch(/프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일/);
    expect(docs.site).toMatch(/검색: JSONPath -> Pointer\[\]/);
    expect(docs.readme).toMatch(/왜 zod-crud인가/);
    expect(docs.llms).toMatch(/Why \/ Core \/ Tutorial Context/);
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
    }
    expect(releaseNotes).toContain("docs:evaluate");
  });

  test("keeps the source layout SSOT aligned", () => {
    for (const [name, source] of Object.entries({ ...docs, releaseNotes })) {
      expect(source, `${name} missing root index entrypoint`).toContain("src/index.ts");
      expect(source, `${name} missing root react entrypoint`).toContain("src/react.ts");
      expect(source, `${name} missing application layer`).toContain("application");
      expect(source, `${name} missing domain layer`).toContain("domain");
      expect(source, `${name} missing foundation layer`).toContain("foundation");
      expect(source, `${name} still mentions stale api layer`).not.toMatch(/src\/api|application\/react|dist\/api/);
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

  test("documents blind outliner implementation gotchas", () => {
    expect(docs.readme).toMatch(/ReadResult/);
    expect(docs.site).toMatch(/결과 객체/);
    expect(docs.llms).toMatch(/ReadResult/);

    expect(docs.readme).toMatch(/doc\.commit\(\.\.\.\)[\s\S]*operation arrays/);
    expect(docs.site).toMatch(/`doc\.commit\(\.\.\.\)`과 `doc\.canPatch\(\.\.\.\)`는/);
    expect(docs.llms).toMatch(/doc\.commit\(\.\.\.\)[\s\S]*operation arrays/);

    expect(docs.readme).toMatch(/Pointer-array copy stores an array payload/);
    expect(docs.site).toMatch(/Pointer 배열을 copy하면 clipboard payload도 배열/);
    expect(docs.llms).toMatch(/Pointer-array copy\/cut stores an array payload/);

    expect(docs.readme).toMatch(/Tree Editing Cookbook/);
    expect(docs.site).toMatch(/tree editing cookbook/);
    expect(docs.llms).toMatch(/Tree semantics are app-owned/);
  });
});
