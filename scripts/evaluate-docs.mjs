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
    .filter((entry) => entry.isDirectory() && entry.name !== "zod-crud")
    .map((entry) => {
      const pkg = JSON.parse(read(`packages/${entry.name}/package.json`));
      return pkg.name;
    })
    .filter((name) => typeof name === "string" && name.startsWith("@zod-crud/"))
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
  readme: read("packages/zod-crud/README.md"),
  spec: read("docs/standard/zod-crud-spec.md"),
  contractPressure: read("docs/standard/contract-pressure-register.md"),
  llms: read("llms.txt"),
  ...publicDocs,
};
const siteRoutes = JSON.parse(read("apps/site/src/site-routes.json"));
const docsRoute = read("apps/site/src/routes/Docs.tsx");
const packageJson = JSON.parse(read("packages/zod-crud/package.json"));
const publicContract = JSON.parse(read("packages/zod-crud/public-contract.json"));
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
  "packages/zod-crud/SPEC.md",
  "apps/site/src/docs/zod-crud-concepts.md",
  "apps/site/src/docs/zod-crud-tutorial.md",
  "apps/site/src/docs/zod-crud-api.md",
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
    "@zod-crud/record-index",
    "@zod-crud/selection-model",
    "@zod-crud/query-watch",
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
  ["extensions", /@zod-crud\/collection/],
  ["extensions", /@zod-crud\/clipboard-web/],
  ["extensions", /@zod-crud\/outline/],
  ["extensions", /labs\/extensions\/\*/],
  ["extensionsCatalog", /Generated extension catalog/],
  ["extensionsCatalog", /Official extensions: \d+/],
  ["extensionsCatalog", /Lab extensions: \d+/],
  ["extensions", /Rich editor host pattern/],
  ["extensions", /origin: "prosemirror"/],
  ["extensions", /## 오해 방지/],
  ["recipes", /## Kanban/],
  ["recipes", /## Grid Table/],
  ["recipes", /## Slide Object Editor/],
  ["recipes", /## Block Docs/],
  ["recipes", /## Misread Guardrails/],
  ["recipes", /stable id에서 JSON Pointer/],
  ["recipes", /TSV\/CSV grid paste/],
  ["rootReadme", /## 문서 지도/],
  ["rootReadme", /docs\/public\/overview\.md/],
  ["rootReadme", /docs\/public\/api\.md/],
  ["rootReadme", /docs\/public\/recipes\.md/],
  ["rootReadme", /## 코드 지도/],
  ["rootReadme", /packages\/zod-crud/],
  ["rootReadme", /apps\/site/],
  ["rootReadme", /labs\/extensions/],
  ["readme", /npm install zod-crud zod/],
  ["readme", /왜 zod-crud인가/],
  ["readme", /작업별 진입점/],
  ["readme", /React — `useJSONDocument`/],
  ["readme", /순수 core/],
  ["readme", /직렬화/],
  ["llms", /왜 \/ 핵심 \/ 튜토리얼 맥락/],
  ["llms", /JSONPath는 검색 전용/],
  ["llms", /ReadResult/],
  ["llms", /Pointer array copy\/cut은 array payload/],
  ["llms", /Tree semantics는 app-owned/],
  ["spec", /JSONPath는 검색 언어/],
  ["spec", /duplicate\(pointer, options\)/],
  ["spec", /public-contract\.json/],
  ["contractPressure", /## Guard Composition/],
  ["contractPressure", /PatchPlan.*아직 이르다/],
  ["contractPressure", /recipe note[\s\S]*lab convention[\s\S]*official extension[\s\S]*core primitive/],
  ["contractPressure", /stable id resolver/],
  ["contractPressure", /## Loop Gate/],
];

for (const [name, pattern] of required) {
  const source = surfaces[name] ?? generatedDocs[name];
  if (!pattern.test(source)) fail(`${name}: missing ${pattern}.`);
}

if (!publicContract.root.values.includes("createJSONDocument") || !publicContract.react.values.includes("useJSONDocument")) {
  fail("public contract: missing required root or react value export.");
}

if (
  packageJson.homepage !== "https://developer-1px.github.io/zod-crud/"
  || packageJson.repository?.url !== "git+https://github.com/developer-1px/zod-crud.git"
  || packageJson.repository?.directory !== "packages/zod-crud"
  || packageJson.bugs?.url !== "https://github.com/developer-1px/zod-crud/issues"
) {
  fail("package metadata: missing official site, repository, or issue tracker URL.");
}

for (const route of [
  ["/docs", "zod-crud Docs - zod-crud"],
  ["/docs/tutorial", "Tutorial - zod-crud"],
  ["/docs/api", "zod-crud API - zod-crud"],
  ["/docs/extensions", "Extensions - zod-crud"],
  ["/docs/recipes", "Product Recipes - zod-crud"],
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
