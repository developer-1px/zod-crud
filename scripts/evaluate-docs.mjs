import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  return existsSync(join(root, path));
}

function markdownFiles(dir = ".") {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build" || entry.name === "coverage") {
      return [];
    }

    const path = dir === "." ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && path.endsWith(".md") ? [path] : [];
  });
}

function officialExtensionNames() {
  return readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "@interactive-os/json-document")
    .map((entry) => {
      const pkg = JSON.parse(read(`packages/${entry.name}/package.json`));
      return pkg.name;
    })
    .filter((name) => typeof name === "string" && name.startsWith("@interactive-os/json-document-"))
    .sort();
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const publicDocs = {
  overview: read("docs/public/overview.md"),
  quickstart: read("docs/public/quickstart.md"),
  api: read("docs/public/api.md"),
  extensions: read("docs/public/extensions.md"),
  recipes: read("docs/public/recipes.md"),
};
const generatedDocs = {
  repoCatalog: JSON.parse(read("docs/generated/repo-catalog.json")),
  extensionsCatalog: read("docs/generated/extensions-catalog.md"),
  siteRepoCatalog: read("apps/site/src/generated/repo-catalog.ts"),
};
const surfaces = {
  rootReadme: read("README.md"),
  readme: read("packages/json-document/README.md"),
  spec: read("docs/standard/json-document-spec.md"),
  foundationGate: read("docs/standard/foundation-gate.md"),
  contractPressure: read("docs/standard/contract-pressure-register.md"),
  resultContract: read("docs/standard/result-contract.md"),
  selectionContract: read("docs/standard/selection-contract.md"),
  schemaIntrospectionContract: read("docs/standard/schema-introspection-contract.md"),
  selfImprovement: read("docs/standard/self-improvement-loop-report.md"),
  llms: read("llms.txt"),
  ...publicDocs,
};
const siteRoutes = JSON.parse(read("apps/site/src/site-routes.json"));
const docsRoute = read("apps/site/src/routes/Docs.tsx");
const packageJson = JSON.parse(read("packages/json-document/package.json"));
const publicContract = JSON.parse(read("packages/json-document/public-contract.json"));
const officialExtensions = officialExtensionNames();
const generatedOfficialExtensions = generatedDocs.repoCatalog.officialExtensions.map((item) => item.name).sort();

for (const removedPath of [
  "docs/release/evaluation-loop.md",
  "docs/release/notes.md",
  "docs/adoption/api-usage-gaps.md",
  "docs/review/public-api-foundation-protocol.md",
  "docs/review/public-api-foundation-report.md",
  "docs/review/extension-package-doubt-audit.md",
  "docs/review/sibling-product-extension-map.md",
  "CHANGELOG.md",
  "packages/json-document/SPEC.md",
  "apps/site/src/docs/json-document-concepts.md",
  "apps/site/src/docs/json-document-tutorial.md",
  "apps/site/src/docs/json-document-api.md",
]) {
  if (exists(removedPath)) fail(`Removed history or duplicate doc still exists: ${removedPath}`);
}

for (const path of markdownFiles()) {
  const name = path.split("/").pop();
  if (!path.startsWith("docs/") && name !== "README.md") {
    fail(`Non-README markdown must live under docs/: ${path}`);
  }
}

for (const [name, source] of Object.entries(surfaces)) {
  for (const pattern of [
    /\{\s*at\s*:/,
    /JSONDocumentPasteMode|PasteMode/,
    /\bUseJSONDocumentOptions\b|\bUseSelectionOptions\b/,
    /\bPasteOptions\b|\bPasteTarget\b/,
    /\bSelectionAction\b/,
    /\bCopyOk\b|\bCopyError\b|\bCutOk\b|\bCutError\b|\bDuplicateOk\b|\bDuplicateError\b|\bPasteError\b|\bPasteDiscriminatorMismatch\b/,
  ]) {
    if (pattern.test(source)) fail(`${name}: stale public API wording found: ${pattern}`);
  }
}

for (const [name, source] of Object.entries(surfaces)) {
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
    if (source.includes(token)) fail(`${name}: public docs must not require internal source path ${token}.`);
  }
}

for (const [name, source] of Object.entries({
  readme: surfaces.readme,
  llms: surfaces.llms,
  overview: surfaces.overview,
  quickstart: surfaces.quickstart,
  api: surfaces.api,
  extensions: surfaces.extensions,
})) {
  for (const pattern of [
    /관리자 메모/,
    /docs:evaluate/,
    /release:check/,
    /prepublishOnly/,
    /evaluation-loop/,
    /public-api-foundation/,
    /api-usage-gaps/,
    /\d+\s*\/\s*100\s*(?:loops complete|루프 완료)/,
  ]) {
    if (pattern.test(source)) fail(`${name}: maintainer history leaked into external docs: ${pattern}`);
  }
}

for (const [name, source] of Object.entries({
  readme: surfaces.readme,
  llms: surfaces.llms,
  extensions: surfaces.extensions,
})) {
  for (const token of [
    "@interactive-os/json-document-record-index",
    "@interactive-os/json-document-selection-model",
    "@interactive-os/json-document-query-watch",
  ]) {
    if (source.includes(token)) fail(`${name}: unshipped extension listed as official: ${token}.`);
  }
}

for (const route of siteRoutes) {
  for (const token of [
    "record indexes",
    "selection models",
    "query watches",
  ]) {
    if (route.description?.includes(token)) fail(`site routes: stale extension description token ${token}.`);
  }
}

for (const extensionName of officialExtensions) {
  if (!generatedDocs.extensionsCatalog.includes(`\`${extensionName}\``)) {
    fail(`generated extension catalog: shipped official extension missing: ${extensionName}.`);
  }
  if (!generatedDocs.siteRepoCatalog.includes(`"name": "${extensionName}"`)) {
    fail(`site repo catalog: shipped official extension missing: ${extensionName}.`);
  }
  if (!surfaces.readme.includes(extensionName)) {
    fail(`readme: shipped official extension missing from README import list: ${extensionName}.`);
  }
  if (!surfaces.llms.includes(extensionName)) {
    fail(`llms: shipped official extension missing from LLM import list: ${extensionName}.`);
  }
}

if (JSON.stringify(officialExtensions) !== JSON.stringify(generatedOfficialExtensions)) {
  fail("generated repo catalog: official extension list does not match packages/*.");
}

if (
  generatedDocs.repoCatalog.totals.officialExtensions !== officialExtensions.length
  || generatedDocs.repoCatalog.totals.labExtensions < 1
  || generatedDocs.repoCatalog.packages.length < officialExtensions.length + 1
) {
  fail("generated repo catalog: package totals are inconsistent.");
}

const required = [
  ["overview", /## 배경/],
  ["overview", /## 핵심 개념/],
  ["overview", /검색: JSONPath -> Pointer\[\]/],
  ["overview", /## 자주 쓰는 작업/],
  ["overview", /## 이걸로 할 수 있는 것들/],
  ["quickstart", /튜토리얼: 작은 카드 편집기 만들기/],
  ["quickstart", /JSONPath는 변경 언어가 아닙니다/],
  ["quickstart", /Pointer 배열을 copy하면 clipboard payload도 배열/],
  ["api", /## 작업별 진입점/],
  ["api", /ReadResult/],
  ["api", /canFind/],
  ["api", /violations\[\]\.path/],
  ["api", /schema-slot/],
  ["api", /document-result/],
  ["api", /Root document Pointer는 빈 문자열 `""`/],
  ["api", /function asPointer/],
  ["api", /applyPatch[\s\S]*외부 JSON 경계/],
  ["api", /신뢰된 document state/],
  ["api", /구조만 가진 Zod schema/],
  ["api", /전체 루트 schema 검증/],
  ["api", /기본값은 `strict: false`/],
  ["extensions", /@json-document\/collection/],
  ["extensions", /@json-document\/clipboard-web/],
  ["extensions", /@json-document\/outline/],
  ["extensions", /labs\/extensions\/\*/],
  ["extensionsCatalog", /Generated extension catalog/],
  ["extensionsCatalog", /Official extensions: \d+/],
  ["extensionsCatalog", /Lab extensions: \d+/],
  ["extensions", /Rich editor host pattern/],
  ["extensions", /origin: "prosemirror"/],
  ["extensions", /## 오해 방지/],
  ["recipes", /## Kanban/],
  ["recipes", /## Grid Table/],
  ["recipes", /## Form Builder/],
  ["recipes", /## Import Review/],
  ["recipes", /## Slide Object Editor/],
  ["recipes", /## Diagram Whiteboard/],
  ["recipes", /## Block Docs/],
  ["recipes", /## Misread Guardrails/],
  ["recipes", /stable id에서 JSON Pointer/],
  ["recipes", /TSV\/CSV grid paste/],
  ["rootReadme", /## 문서 지도/],
  ["rootReadme", /docs\/public\/overview\.md/],
  ["rootReadme", /docs\/public\/api\.md/],
  ["rootReadme", /docs\/public\/recipes\.md/],
  ["rootReadme", /## 코드 지도/],
  ["rootReadme", /packages\/json-document/],
  ["rootReadme", /apps\/site/],
  ["rootReadme", /labs\/extensions/],
  ["readme", /npm install json-document zod/],
  ["readme", /왜 json-document인가/],
  ["readme", /작업별 진입점/],
  ["readme", /React — `useJSONDocument`/],
  ["readme", /순수 core/],
  ["readme", /직렬화/],
  ["llms", /왜 \/ 핵심 \/ 튜토리얼 맥락/],
  ["llms", /JSONPath는 검색 전용/],
  ["llms", /ReadResult/],
  ["llms", /Pointer array copy\/cut은 array payload/],
  ["llms", /Tree semantics는 app-owned/],
  ["llms", /docs\/standard\/result-contract\.md/],
  ["llms", /docs\/standard\/selection-contract\.md/],
  ["llms", /docs\/standard\/schema-introspection-contract\.md/],
  ["spec", /JSONPath는 검색 언어/],
  ["spec", /duplicate\(pointer, options\)/],
  ["spec", /public-contract\.json/],
  ["contractPressure", /## Guard Composition/],
  ["contractPressure", /PatchPlan.*아직 이르다/],
  ["contractPressure", /recipe note[\s\S]*lab convention[\s\S]*official extension[\s\S]*core primitive/],
  ["contractPressure", /stable id resolver/],
  ["contractPressure", /## Loop Gate/],
  ["foundationGate", /result\/error freeze[\s\S]*docs\/standard\/result-contract\.md/],
  ["foundationGate", /selection freeze[\s\S]*docs\/standard\/selection-contract\.md/],
  ["foundationGate", /schema introspection freeze[\s\S]*docs\/standard\/schema-introspection-contract\.md/],
  ["resultContract", /## JSONResult/],
  ["resultContract", /## JSONCapabilityResult/],
  ["resultContract", /CapabilityErrorCode/],
  ["resultContract", /violations\[\]\.path/],
  ["resultContract", /diagnostic text는 `reason`/],
  ["resultContract", /discriminator_mismatch/],
  ["resultContract", /preflight_failed/],
  ["resultContract", /empty_clipboard/],
  ["resultContract", /doc\.undo\(\).*doc\.redo\(\)[\s\S]*JSONCapabilityResult/],
  ["resultContract", /schema-slot[\s\S]*document-result/],
  ["selectionContract", /SelectionSnap/],
  ["selectionContract", /selectedPointers/],
  ["selectionContract", /selectionRanges/],
  ["selectionContract", /primaryIndex/],
  ["selectionContract", /selectionAfter/],
  ["selectionContract", /SelectionMode/],
  ["selectionContract", /SelectionTextEditErrorCode|Text edit 실패 code/],
  ["selectionContract", /DOM focus/],
  ["schemaIntrospectionContract", /SchemaKind/],
  ["schemaIntrospectionContract", /SchemaPathMode/],
  ["schemaIntrospectionContract", /schema-slot/],
  ["schemaIntrospectionContract", /document-result/],
  ["schemaIntrospectionContract", /SchemaDescription/],
  ["schemaIntrospectionContract", /jsonSchema/],
  ["schemaIntrospectionContract", /JSONCapabilityResult/],
  ["selfImprovement", /10회 루프 완료 기록/],
  ["selfImprovement", /Result\/error code freeze/],
  ["selfImprovement", /Selection semantics freeze/],
  ["selfImprovement", /Schema introspection freeze/],
  ["selfImprovement", /1\.0 전 Core 금지 목록/],
];

for (const [name, pattern] of required) {
  const source = surfaces[name] ?? generatedDocs[name];
  if (!pattern.test(source)) fail(`${name}: missing ${pattern}.`);
}

if (!publicContract.root.values.includes("createJSONDocument") || !publicContract.react.values.includes("useJSONDocument")) {
  fail("public contract: missing required root or react value export.");
}

if (
  packageJson.homepage !== "https://developer-1px.github.io/json-document/"
  || packageJson.repository?.url !== "git+https://github.com/developer-1px/json-document.git"
  || packageJson.repository?.directory !== "packages/json-document"
  || packageJson.bugs?.url !== "https://github.com/developer-1px/json-document/issues"
) {
  fail("package metadata: missing official site, repository, or issue tracker URL.");
}

for (const route of [
  ["/docs", "json-document Docs - json-document"],
  ["/docs/tutorial", "Tutorial - json-document"],
  ["/docs/api", "json-document API - json-document"],
  ["/docs/extensions", "Extensions - json-document"],
  ["/docs/recipes", "Product Recipes - json-document"],
]) {
  if (!siteRoutes.some((item) => item.path === route[0] && item.title === route[1])) {
    fail(`site routes: missing ${route[0]} ${route[1]} metadata.`);
  }
}

for (const pattern of [
  /\.\.\/\.\.\/\.\.\/\.\.\/docs\/public\/overview\.md\?raw/,
  /\.\.\/\.\.\/\.\.\/\.\.\/docs\/public\/quickstart\.md\?raw/,
  /\.\.\/\.\.\/\.\.\/\.\.\/docs\/public\/api\.md\?raw/,
  /\.\.\/\.\.\/\.\.\/\.\.\/docs\/public\/extensions\.md\?raw/,
  /\.\.\/\.\.\/\.\.\/\.\.\/docs\/public\/recipes\.md\?raw/,
  /\.\.\/\.\.\/\.\.\/\.\.\/docs\/generated\/extensions-catalog\.md\?raw/,
  /Documentation pages/,
  /On this page/,
]) {
  if (!pattern.test(docsRoute)) fail(`site docs route: missing ${pattern}.`);
}

console.log("docs evaluation ok");
