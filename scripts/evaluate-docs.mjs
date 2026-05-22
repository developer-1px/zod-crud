import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const ledger = read("docs/evaluation-loop.md");
const progress = /(\d+)\s*\/\s*100 loops complete/.exec(ledger);
if (!progress) {
  fail("Missing evaluation loop progress line.");
}

const completed = progress ? Number(progress[1]) : 0;
const progressTable = ledger.split("## Next Candidates")[0] ?? ledger;
const rowCount = (progressTable.match(/^\|\s*\d{3}\s*\|/gm) ?? []).length;
if (completed !== rowCount) {
  fail(`Ledger progress mismatch: progress=${completed}, rows=${rowCount}.`);
}

if (/pending verification/i.test(ledger)) {
  fail("Ledger still contains pending verification.");
}

const surfaces = {
  readme: read("packages/zod-crud/README.md"),
  spec: read("packages/zod-crud/SPEC.md"),
  site: read("apps/site/src/docs/zod-crud-api.md"),
  llms: read("llms.txt"),
};
const smoke = read("packages/zod-crud/test/package-smoke.mjs");
const markdownViewer = read("apps/site/src/components/MarkdownViewer.tsx");
const workbenchTest = read("apps/site/tests/interface-workbench.test.tsx");
const siteHtml = read("apps/site/index.html");
const siteFavicon = read("apps/site/public/favicon.svg");
const siteManifest = read("apps/site/public/site.webmanifest");
const siteViteConfig = read("apps/site/vite.config.ts");
const siteShellTest = read("apps/site/tests/site-shell.test.tsx");
const docsRoute = read("apps/site/src/routes/Docs.tsx");
const siteEvaluator = read("scripts/evaluate-site.mjs");
const rootPackageJson = read("package.json");
const pagesWorkflow = read(".github/workflows/pages.yml");

for (const [name, source] of Object.entries(surfaces)) {
  if (/\{\s*at\s*:/.test(source)) fail(`${name}: legacy paste target { at } found.`);
  if (/JSONDocumentPasteMode|PasteMode/.test(source)) fail(`${name}: stale paste mode name found.`);
}

const required = [
  ["site", /작업별 진입점/],
  ["site", /작업 레이어 예시/],
  ["site", /JSONPath는 변경 언어가 아닙니다/],
  ["readme", /Task Entrypoints/],
  ["readme", /Use JSONPath to find values, not to mutate them directly/],
  ["spec", /duplicate\(pointer, options\)/],
  ["spec", /JSONPath is a search language/],
  ["llms", /JSONPath is for search only/],
];

for (const [name, pattern] of required) {
  if (!pattern.test(surfaces[name])) fail(`${name}: missing ${pattern}.`);
}

for (const [name, source] of Object.entries(surfaces)) {
  if (!source.includes("canFind")) fail(`${name}: missing canFind in public can* family.`);
}

const publicExports = [
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
  "JSONDocumentChangeListener",
  "JSONDocumentCommitOptions",
  "JSONDocumentCommitSelection",
  "JSONDocumentDuplicateOptions",
  "JSONDocumentDuplicateResult",
  "JSONDocumentHistory",
  "JSONDocumentLoadOptions",
  "JSONDocumentMutationOk",
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

for (const exportName of publicExports) {
  for (const surfaceName of ["readme", "spec", "site"]) {
    if (!surfaces[surfaceName].includes(exportName)) {
      fail(`${surfaceName}: missing public export ${exportName}.`);
    }
  }
}

for (const [name, source] of Object.entries(surfaces)) {
  if (!source.includes("docs:evaluate")) fail(`${name}: missing docs:evaluate release gate.`);
}

if (!/@ts-expect-error \{ at \} is intentionally not a public paste target/.test(smoke)) {
  fail("package smoke: missing negative type guard for legacy { at } paste target.");
}

if (!/public interface clipboard paste failed/.test(smoke) || !/public interface duplicate failed/.test(smoke)) {
  fail("package smoke: missing installed-package public interface scenario.");
}

if (!/\{ type: "table"; header: string\[\]; rows: string\[\]\[\] \}/.test(markdownViewer) || !/<table/.test(markdownViewer)) {
  fail("MarkdownViewer: table rendering support missing.");
}

if (!/getAllByRole\("table"\)/.test(workbenchTest)) {
  fail("workbench test: Markdown table rendering assertion missing.");
}

for (const pattern of [
  /name="description"/,
  /name="theme-color"/,
  /property="og:title"/,
  /property="og:description"/,
  /name="twitter:card"/,
  /rel="canonical"/,
  /rel="icon"/,
  /rel="manifest"/,
  /Headless JSON editing/,
]) {
  if (!pattern.test(siteHtml)) fail(`site html: missing ${pattern}.`);
}

if (!/<svg/.test(siteFavicon) || !/zod-crud/.test(siteManifest)) {
  fail("site public assets: missing favicon or web manifest.");
}

for (const pattern of [/fileName: "404\.html"/, /fileName: "robots\.txt"/, /fileName: "sitemap\.xml"/]) {
  if (!pattern.test(siteViteConfig)) fail(`site vite config: missing ${pattern}.`);
}

if (!/direct route entry/.test(siteShellTest) || !/Skip to content/.test(siteShellTest)) {
  fail("site shell test: missing production navigation/accessibility coverage.");
}

if (!/markdownHeadings/.test(docsRoute) || !/On this page/.test(docsRoute) || !/Documentation sections/.test(docsRoute) || !/작업별-진입점/.test(siteShellTest)) {
  fail("site docs: missing table-of-contents navigation coverage.");
}

if (!/playground:typecheck/.test(rootPackageJson) || !/playground:test/.test(rootPackageJson) || !/playground:build/.test(rootPackageJson) || !/site:evaluate/.test(rootPackageJson)) {
  fail("root verify: missing playground production site gates.");
}

if (!/npm run verify/.test(pagesWorkflow) || !/npm run site:evaluate/.test(pagesWorkflow) || !/SITE_BASE: \/zod-crud\//.test(pagesWorkflow) || !/SITE_URL: https:\/\/developer-1px\.github\.io\/zod-crud/.test(pagesWorkflow)) {
  fail("pages workflow: missing production site verification or deployment base.");
}

for (const pattern of [/404\.html/, /robots\.txt/, /sitemap\.xml/, /site\.webmanifest/, /site evaluation ok/]) {
  if (!pattern.test(siteEvaluator)) fail(`site evaluator: missing ${pattern}.`);
}

if (!/SITE_BASE/.test(siteEvaluator) || !/unexpanded Vite base placeholder/.test(siteEvaluator)) {
  fail("site evaluator: missing production base path checks.");
}

for (const surfaceName of ["readme", "spec", "site"]) {
  const source = surfaces[surfaceName];
  if (!/selectedPointers/.test(source)) fail(`${surfaceName}: missing selection detail.`);
  if (!/textPatch/.test(source)) fail(`${surfaceName}: missing selection text planning.`);
  if (!/restore\(snapshot\)/.test(source)) fail(`${surfaceName}: missing selection restore example.`);
  if (!/mergeKey/.test(source)) fail(`${surfaceName}: missing history metadata mergeKey.`);
  if (!/mergeLast/.test(source)) fail(`${surfaceName}: missing history mergeLast.`);
}

if (process.exitCode === undefined) {
  console.log(`docs evaluation ok: ${completed}/100 loops recorded`);
}
