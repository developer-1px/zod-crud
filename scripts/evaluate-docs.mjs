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
const workbenchPlayground = read("apps/site/src/playgrounds/InterfaceWorkbench.playground.tsx");
const workbenchTest = read("apps/site/tests/interface-workbench.test.tsx");
const playwrightConfig = read("playwright.config.ts");
const browserSiteTest = read("tests/browser/site.spec.ts");
const browserOutlinerTest = read("tests/browser/outliner.spec.ts");
const siteHtml = read("apps/site/index.html");
const siteFavicon = read("apps/site/public/favicon.svg");
const siteManifest = read("apps/site/public/site.webmanifest");
const siteViteConfig = read("apps/site/vite.config.ts");
const siteApp = read("apps/site/src/App.tsx");
const siteRoutesJson = read("apps/site/src/site-routes.json");
const siteShellTest = read("apps/site/tests/site-shell.test.tsx");
const docsRoute = read("apps/site/src/routes/Docs.tsx");
const siteEvaluator = read("scripts/evaluate-site.mjs");
const siteHttpEvaluator = read("scripts/evaluate-site-http.mjs");
const liveSiteEvaluator = read("scripts/evaluate-live-site.mjs");
const siteRouteChecks = read("scripts/site-route-checks.mjs");
const rootPackageJson = read("package.json");
const packageJson = JSON.parse(read("packages/zod-crud/package.json"));
const pagesWorkflow = read(".github/workflows/pages.yml");
const siteRoutes = JSON.parse(siteRoutesJson);

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

for (const [name, source] of Object.entries({ readme: surfaces.readme, llms: surfaces.llms })) {
  if (!source.includes("https://developer-1px.github.io/zod-crud/")) {
    fail(`${name}: missing official site URL.`);
  }
}

if (
  packageJson.homepage !== "https://developer-1px.github.io/zod-crud/"
  || packageJson.repository?.url !== "git+https://github.com/developer-1px/zod-crud.git"
  || packageJson.repository?.directory !== "packages/zod-crud"
  || packageJson.bugs?.url !== "https://github.com/developer-1px/zod-crud/issues"
) {
  fail("package metadata: missing official site, repository, or issue tracker URL.");
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

if (/max-h-96/.test(workbenchPlayground)) {
  fail("workbench playground: JSON code output must not pin a max height.");
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
  /name="twitter:title"/,
  /name="twitter:description"/,
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

for (const route of [
  ["/", "zod-crud - Headless JSON editing", "zod-crud is a Zod-guarded headless JSON editing engine for JSON Patch, JSON Pointer, JSONPath, selection, clipboard, and history."],
  ["/docs", "zod-crud API - zod-crud", "Complete zod-crud API reference for document operations, selection, clipboard, history, schema checks, JSON Pointer, and JSONPath."],
  ["/playground", "Workbench - zod-crud", "Interactive zod-crud workbench for trying document operations, can* checks, selection, clipboard, history, schema guards, and JSONPath search."],
  ["/playground/outliner", "Outliner demo - zod-crud", "Keyboard-first outliner demo showing zod-crud selection, clipboard, history, structure edits, and JSON document movement."],
  ["/playground/mobile-cms", "Mobile CMS demo - zod-crud", "Mobile CMS demo showing schema-guarded page editing, content block movement, paste targets, and zod-crud document history."],
  ["/playground/api-collection", "API collection demo - zod-crud", "API collection demo showing request and response JSON editing, search, duplication, selection, and clipboard flows with zod-crud."],
]) {
  if (!siteRoutes.some((item) => item.path === route[0] && item.title === route[1] && item.description === route[2])) {
    fail(`site routes: missing ${route[0]} ${route[1]} metadata.`);
  }
}

for (const pattern of [
  /fileName: "404\.html"/,
  /fileName: "robots\.txt"/,
  /fileName: "sitemap\.xml"/,
  /site-routes\.json/,
  /routeHtml/,
  /name="description"/,
  /og:description/,
  /og:url/,
  /twitter:description/,
]) {
  if (!pattern.test(siteViteConfig)) fail(`site vite config: missing ${pattern}.`);
}

if (!/direct route entry/.test(siteShellTest) || !/Skip to content/.test(siteShellTest)) {
  fail("site shell test: missing production navigation/accessibility coverage.");
}

if (!/site-routes\.json/.test(siteApp) || !/setRouteMetadata/.test(siteApp) || !/document\.title/.test(siteApp) || !/description/.test(siteApp) || !/og:description/.test(siteApp) || !/og:url/.test(siteApp) || !/twitter:description/.test(siteApp) || !/canonicalUrl/.test(siteApp) || !/VITE_SITE_URL/.test(siteApp)) {
  fail("site app: missing client-side route metadata updates.");
}

if (
  !/lazy\(\(\) => import\("\.\/routes\/Docs"\)/.test(siteApp)
  || !/lazy\(\(\) => import\("\.\/routes\/Playground"\)/.test(siteApp)
  || !/lazy\(\(\) => import\("@zod-crud\/outliner"\)/.test(siteApp)
  || !/lazy\(\(\) => import\("@zod-crud\/mobile-cms"\)/.test(siteApp)
  || !/lazy\(\(\) => import\("@zod-crud\/api-collection"\)/.test(siteApp)
) {
  fail("site app: route docs and demos must be lazy-loaded from the overview page.");
}

if (/import\s+\{[^}]*ApiCollection|import\s+\{[^}]*Outliner|from "@zod-crud\/mobile-cms"/.test(siteApp)) {
  fail("site app: demo packages must not be statically imported into the overview bundle.");
}

if (!/document\.title/.test(siteShellTest) || !/name="description"/.test(siteShellTest) || !/og:description/.test(siteShellTest) || !/og:url/.test(siteShellTest) || !/twitter:description/.test(siteShellTest) || !/canonical/.test(siteShellTest)) {
  fail("site shell test: missing client-side route metadata coverage.");
}

if (!/markdownHeadings/.test(docsRoute) || !/On this page/.test(docsRoute) || !/Documentation sections/.test(docsRoute) || !/작업별-진입점/.test(siteShellTest)) {
  fail("site docs: missing table-of-contents navigation coverage.");
}

if (!/playground:typecheck/.test(rootPackageJson) || !/playground:test/.test(rootPackageJson) || !/playground:build/.test(rootPackageJson) || !/site:evaluate/.test(rootPackageJson) || !/site:verify:pages/.test(rootPackageJson) || !/site:smoke:pages/.test(rootPackageJson) || !/browser:test/.test(rootPackageJson)) {
  fail("root verify: missing playground production site gates.");
}

if (!/"verify": ".*browser:test/.test(rootPackageJson)) {
  fail("root verify: missing real-browser site gate.");
}

if (!/testDir: "\.\/tests\/browser"/.test(playwrightConfig) || !/webServer/.test(playwrightConfig) || !/PLAYWRIGHT_BASE_URL/.test(playwrightConfig)) {
  fail("playwright config: missing browser test directory or dev server setup.");
}

if (!/video:\s*"off"/.test(playwrightConfig)) {
  fail("playwright config: video must stay off so CI does not require ffmpeg.");
}

if (!/defers demo and engine code/.test(browserSiteTest) || !/InterfaceWorkbench\.playground/.test(browserSiteTest) || !/toHaveTitle\("zod-crud API - zod-crud"\)/.test(browserSiteTest)) {
  fail("browser site test: missing production route split and metadata coverage.");
}

if (!/keyboard editing and undo in a real browser/.test(browserOutlinerTest)) {
  fail("browser outliner test: missing real-browser editing coverage.");
}

for (const pattern of [
  /site:build:pages/,
  /site:evaluate:pages/,
  /site:smoke:pages/,
  /site:verify:pages/,
  /SITE_BASE=\/zod-crud\//,
  /SITE_URL=https:\/\/developer-1px\.github\.io\/zod-crud/,
  /VITE_SITE_URL=https:\/\/developer-1px\.github\.io\/zod-crud/,
]) {
  if (!pattern.test(rootPackageJson)) fail(`root package: missing ${pattern}.`);
}

if (!/"site:verify:pages": "npm run site:build:pages && npm run site:evaluate:pages && npm run site:smoke:pages"/.test(rootPackageJson)) {
  fail("root package: Pages verification must build, evaluate files, then smoke test HTTP serving.");
}

if (!/npm run verify/.test(pagesWorkflow) || !/site:evaluate:live/.test(rootPackageJson) || !/actions\/checkout@v4/.test(pagesWorkflow) || !/actions\/setup-node@v4/.test(pagesWorkflow) || !/upload-pages-artifact@v3/.test(pagesWorkflow)) {
  fail("pages workflow: missing production site verification, artifact upload, or live evaluation support.");
}

if (!/Verify workspace and build Pages artifact/.test(pagesWorkflow)) {
  fail("pages workflow: npm run verify must leave a Pages-ready artifact.");
}

for (const pattern of [
  /404\.html/,
  /site-routes\.json/,
  /validateSiteRoutes/,
  /routeFile/,
  /route title/,
  /route description/,
  /route canonical/,
  /route og:description/,
  /route og:url/,
  /route twitter:description/,
  /hasMetaContent/,
  /expectedSiteUrl/,
  /routeUrl/,
  /robots\.txt/,
  /sitemap\.xml/,
  /site\.webmanifest/,
  /site evaluation ok/,
  /localAssetPaths/,
  /references missing asset/,
  /must not preload playground or engine chunks/,
]) {
  if (!pattern.test(siteEvaluator)) fail(`site evaluator: missing ${pattern}.`);
}

for (const pattern of [
  /createServer/,
  /site-routes\.json/,
  /validateSiteRoutes/,
  /SITE_BASE/,
  /fetchRequiredText/,
  /localAssetPaths/,
  /route description/,
  /route canonical/,
  /route og:description/,
  /route og:url/,
  /route twitter:description/,
  /hasMetaContent/,
  /site HTTP evaluation ok/,
]) {
  if (!pattern.test(siteHttpEvaluator)) fail(`site HTTP evaluator: missing ${pattern}.`);
}

if (!/SITE_BASE/.test(siteEvaluator) || !/unexpanded Vite base placeholder/.test(siteEvaluator)) {
  fail("site evaluator: missing production base path checks.");
}

for (const pattern of [
  /site:evaluate:live/,
  /live site evaluation ok/,
  /SITE_LIVE_ATTEMPTS/,
  /live_check/,
  /readFileSync/,
  /site-routes\.json/,
  /validateSiteRoutes/,
  /route description/,
  /route canonical/,
  /route og:description/,
  /route og:url/,
  /route twitter:description/,
  /hasMetaContent/,
  /site\.webmanifest/,
  /favicon\.svg/,
  /aria-label="zod-crud"/,
  /must not preload playground or engine chunks/,
  /routeUrl/,
  /fetchText\(route\.path\)/,
]) {
  const source = pattern.source.includes("site:evaluate:live") ? rootPackageJson : liveSiteEvaluator;
  if (!pattern.test(source)) fail(`live site evaluator: missing ${pattern}.`);
}

if (/\[200, 404\]/.test(liveSiteEvaluator)) {
  fail("live site evaluator: route pages must require HTTP 200, not 404 fallback.");
}

for (const pattern of [
  /validateSiteRoutes/,
  /duplicate path/,
  /duplicate output file/,
  /missing a description/,
  /duplicate description/,
  /invalid group/,
  /overview route/,
  /routeFile/,
]) {
  if (!pattern.test(siteRouteChecks)) fail(`site route checks: missing ${pattern}.`);
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
