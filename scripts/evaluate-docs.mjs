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

const ledger = read("docs/release/evaluation-loop.md");
const progress = /(\d+)\s*\/\s*100\s*(?:loops complete|루프 완료)/.exec(ledger);
if (!progress) {
  fail("Missing evaluation loop progress line.");
}

const completed = progress ? Number(progress[1]) : 0;
if (completed < 100) {
  fail(`Ledger progress must be at least 100 loops, got ${completed}.`);
}

for (const pattern of [/평가/, /실행/, /점수/, /001-025/, /135-141/]) {
  if (!pattern.test(ledger)) fail(`Ledger summary missing ${pattern}.`);
}

if (/pending verification|검증 대기/i.test(ledger)) {
  fail("Ledger still contains pending verification.");
}

const siteDocs = {
  concepts: read("apps/site/src/docs/zod-crud-concepts.md"),
  tutorial: read("apps/site/src/docs/zod-crud-tutorial.md"),
  api: read("apps/site/src/docs/zod-crud-api.md"),
};
const surfaces = {
  readme: read("packages/zod-crud/README.md"),
  spec: read("packages/zod-crud/SPEC.md"),
  site: Object.values(siteDocs).join("\n\n"),
  llms: read("llms.txt"),
};
const releaseNotes = read("docs/release/notes.md");
const apiUsageGaps = read("docs/adoption/api-usage-gaps.md");
const smoke = read("packages/zod-crud/tests/smoke/package-smoke.mjs");
const markdownViewer = read("apps/site/src/components/MarkdownViewer.tsx");
const workbenchPlayground = read("apps/site/src/playgrounds/InterfaceWorkbench.playground.tsx");
const workbenchTest = read("apps/site/tests/interface-workbench.test.tsx");
const playwrightConfig = read("playwright.config.ts");
const browserSiteTest = read("tests/browser/site.spec.ts");
const browserOutlinerTest = read("tests/browser/outliner.spec.ts");
const benchmarkCore = read("scripts/benchmark-core.mjs");
const siteHtml = read("apps/site/index.html");
const siteFavicon = read("apps/site/public/favicon.svg");
const siteManifest = read("apps/site/public/site.webmanifest");
const siteViteConfig = read("apps/site/vite.config.ts");
const siteApp = read("apps/site/src/App.tsx");
const siteRoutesJson = read("apps/site/src/site-routes.json");
const siteShellTest = read("apps/site/tests/site-shell.test.tsx");
const docsRoute = read("apps/site/src/routes/Docs.tsx");
const playgroundRoute = read("apps/site/src/routes/Playground.tsx");
const siteEvaluator = read("scripts/evaluate-site.mjs");
const siteHttpEvaluator = read("scripts/evaluate-site-http.mjs");
const liveSiteEvaluator = read("scripts/evaluate-live-site.mjs");
const siteRouteChecks = read("scripts/site-route-checks.mjs");
const rootPackageJson = read("package.json");
const rootPackage = JSON.parse(rootPackageJson);
const packageJson = JSON.parse(read("packages/zod-crud/package.json"));
const publicContractJson = read("packages/zod-crud/public-contract.json");
const publicContract = JSON.parse(publicContractJson);
const pagesWorkflow = read(".github/workflows/pages.yml");
const siteRoutes = JSON.parse(siteRoutesJson);

for (const [name, source] of Object.entries(surfaces)) {
  if (/\{\s*at\s*:/.test(source)) fail(`${name}: legacy paste target { at } found.`);
  if (/JSONDocumentPasteMode|PasteMode/.test(source)) fail(`${name}: stale paste mode name found.`);
  if (/\bUseJSONDocumentOptions\b|\bUseSelectionOptions\b/.test(source)) fail(`${name}: stale use-prefixed root option type found.`);
  if (/\bPasteOptions\b|\bPasteTarget\b/.test(source)) fail(`${name}: stale generic paste option type found.`);
  if (/\bSelectionAction\b/.test(source)) fail(`${name}: stale selection action type found.`);
  if (/\bCopyOk\b|\bCopyError\b|\bCutOk\b|\bCutError\b|\bDuplicateOk\b|\bDuplicateError\b|\bPasteError\b|\bPasteDiscriminatorMismatch\b/.test(source)) {
    fail(`${name}: stale unscoped action result type found.`);
  }
}

const required = [
  ["site", /## 배경/],
  ["site", /## 핵심 개념/],
  ["site", /튜토리얼: 작은 카드 편집기 만들기/],
  ["site", /이걸로 할 수 있는 것들/],
  ["readme", /왜 zod-crud인가/],
  ["llms", /왜 \/ 핵심 \/ 튜토리얼 맥락/],
  ["site", /작업별 진입점/],
  ["site", /앱 액션 예시/],
  ["site", /JSONPath는 변경 언어가 아닙니다/],
  ["site", /결과 객체/],
  ["site", /Pointer 배열을 copy하면 clipboard payload도 배열/],
  ["site", /트리 편집 cookbook/],
  ["readme", /작업별 진입점/],
  ["readme", /JSONPath는 값을 찾는 언어이며 직접 변경하지 않습니다/],
  ["readme", /ReadResult/],
  ["readme", /Pointer 배열을 copy\/cut하면 clipboard payload도 배열/],
  ["readme", /트리 편집 Cookbook/],
  ["spec", /duplicate\(pointer, options\)/],
  ["spec", /JSONPath는 검색 언어/],
  ["llms", /JSONPath는 검색 전용/],
  ["llms", /ReadResult/],
  ["llms", /Pointer array copy\/cut은 array payload/],
  ["llms", /Tree semantics는 app-owned/],
  ["readme", /applyPatch[\s\S]*외부 JSON 경계/],
  ["spec", /applyPatch[\s\S]*외부 JSON 경계/],
  ["site", /applyPatch[\s\S]*외부 JSON 경계/],
  ["llms", /applyPatch[\s\S]*외부 JSON 경계/],
  ["readme", /신뢰된 document state/],
  ["spec", /신뢰된 document state/],
  ["site", /신뢰된 document state/],
  ["llms", /신뢰된 document state/],
  ["readme", /구조만 가진 Zod schema/],
  ["spec", /구조만 가진 Zod schema/],
  ["site", /구조만 가진 Zod schema/],
  ["llms", /구조만 가진 Zod schema/],
  ["readme", /전체 루트 schema 검증/],
  ["spec", /전체 루트 schema 검증/],
  ["site", /전체 루트 schema 검증/],
  ["llms", /전체 루트 schema 검증/],
  ["readme", /npm run perf:core/],
  ["spec", /npm run perf:core/],
  ["site", /npm run perf:core/],
  ["llms", /npm run perf:core/],
  ["readme", /standard:check/],
  ["spec", /standard:check/],
  ["site", /standard:check/],
  ["llms", /standard:check/],
];

for (const [name, pattern] of required) {
  if (!pattern.test(surfaces[name])) fail(`${name}: missing ${pattern}.`);
}

const conceptMaintainer = siteDocs.concepts.indexOf("## 관리자 메모");
const apiMaintainer = siteDocs.api.indexOf("## 관리자 메모");
const readmeMaintainer = surfaces.readme.indexOf("## 관리자 메모");
const conceptWorkflow = siteDocs.concepts.indexOf("앱에서 하려는 일");
const conceptUsage = siteDocs.concepts.indexOf("## 기본 사용 흐름");
const apiEntrypoints = siteDocs.api.indexOf("## 작업별 진입점");
const readmeEntrypoints = surfaces.readme.indexOf("## 작업별 진입점");
if (conceptMaintainer < 0 || apiMaintainer < 0 || readmeMaintainer < 0) {
  fail("site docs: maintainer notes section is missing.");
}
if (
  conceptWorkflow < 0
  || conceptUsage < 0
  || apiEntrypoints < 0
  || readmeEntrypoints < 0
  || conceptWorkflow > conceptMaintainer
  || conceptUsage > conceptMaintainer
  || apiEntrypoints > apiMaintainer
  || readmeEntrypoints > readmeMaintainer
) {
  fail("human docs: user-facing workflow must appear before maintainer internals.");
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

for (const [name, source] of Object.entries(surfaces)) {
  if (!source.includes("canFind")) fail(`${name}: missing canFind in public can* family.`);
}

for (const [name, source] of Object.entries(surfaces)) {
  for (const [label, pattern] of [
    ["violation path", /violations?\[\]\.path|violations[\s\S]{0,80}violation\.path/],
    ["schema-slot", /schema-slot/],
    ["document-result", /document-result/],
    ["strict", /strict/],
    ["onError", /onError/],
    ["JSONCrudError", /JSONCrudError/],
    ["discriminator_mismatch", /discriminator_mismatch/],
    ["patch stream", /patch\s+stream|패치 스트림/],
    ["history-entry inspector", /history-entry\s+inspector|history entry inspector|history entry inspector가 아닙니다|history entry inspector가 아니다/],
    ["command/action layer", /command\/action\s+layer/],
  ]) {
    if (!pattern.test(source)) fail(`${name}: missing S1 cleanup token ${label}.`);
  }
}

const publicExports = [...publicContract.root.values, ...publicContract.root.types];

if (!publicContract.root.values.includes("createJSONDocument") || !publicContract.react.values.includes("useJSONDocument")) {
  fail("public contract: missing required root or react value export.");
}

if (!/public-contract\.json/.test(smoke)) {
  fail("package smoke: must read the public export contract SSOT.");
}

for (const [name, source] of Object.entries({ spec: surfaces.spec, releaseNotes })) {
  if (!source.includes("public-contract.json")) fail(`${name}: missing public contract SSOT.`);
}

for (const exportName of publicExports) {
  for (const surfaceName of ["readme", "spec", "site"]) {
    if (!surfaces[surfaceName].includes(exportName)) {
      fail(`${surfaceName}: missing public export ${exportName}.`);
    }
  }
}

for (const [name, source] of Object.entries(surfaces)) {
  if (!source.includes("docs:evaluate")) fail(`${name}: missing docs:evaluate release gate.`);
  if (!source.includes("release:check")) fail(`${name}: missing release:check release gate.`);
  if (!source.includes("standard:check")) fail(`${name}: missing standard:check foundation gate.`);
}

if (!releaseNotes.includes("release:check")) {
  fail("release notes: missing release:check release gate.");
}

if (!releaseNotes.includes("standard:check")) {
  fail("release notes: missing standard:check foundation gate.");
}

if (rootPackage.scripts?.["release:check"] !== "npm run verify && npm run standard:check && npm run perf:core && npm run pack:library") {
  fail("root package: release:check must run verify, standard:check, perf:core, and pack:library in order.");
}

if (rootPackage.scripts?.["standard:check"] !== "node scripts/evaluate-standardization.mjs && npm test -w zod-crud -- standard-conformance") {
  fail("root package: standard:check must run the standardization evaluator and public conformance suite.");
}

if (/dist\/foundation\/json-patch|dist\/foundation\/json\.js/.test(benchmarkCore)) {
  fail("benchmark core: stale dist foundation path found.");
}
for (const pattern of [
  /dist\/foundation\/json\/clone\.js/,
  /dist\/foundation\/json\/serializable\.js/,
  /dist\/foundation\/jsonpath\/parse\.js/,
  /dist\/foundation\/jsonpath\/evaluate\.js/,
  /dist\/foundation\/patch\/trusted\.js/,
  /dist\/foundation\/patch\/inverse\.js/,
]) {
  if (!pattern.test(benchmarkCore)) fail(`benchmark core: missing ${pattern}.`);
}

if (packageJson.scripts?.prepublishOnly !== "npm --prefix ../.. run release:check") {
  fail("package publish: prepublishOnly must delegate to root release:check.");
}

if (packageJson.version !== "1.0.0" || !/1\.0\.0`? 패키지 버전|패키지 버전은 `1\.0\.0`|package version은 `1\.0\.0`/.test(releaseNotes)) {
  fail("package release: version must be 1.0.0 and documented in release notes.");
}

if (!/prepublishOnly[\s\S]*release:check/.test(surfaces.llms) || !/prepublishOnly[\s\S]*release:check/.test(releaseNotes)) {
  fail("release docs: prepublishOnly must document release:check delegation.");
}

if (/src\/api|application\/react|dist\/api/.test(releaseNotes)) {
  fail("release notes: stale source layout path found.");
}

if (!/패키지 import 경로는 변경되지 않았다/.test(releaseNotes) || !/docs:evaluate/.test(releaseNotes)) {
  fail("release notes: missing package import release contract.");
}

if (!/릴리스 결정:[\s\S]*프로덕션 root 계약에서 `doc\.ops`를 제외한다/.test(apiUsageGaps)) {
  fail("api usage gaps: doc.ops production release decision is not locked.");
}

if (!/릴리스 결정:[\s\S]*프로덕션 root 계약에서 `doc\.commands`를 제외한다/.test(apiUsageGaps)) {
  fail("api usage gaps: doc.commands production release decision is not locked.");
}

if (/\bP0\b/.test(apiUsageGaps)) {
  fail("api usage gaps: unresolved P0 wording must not remain in the 1.0 release ledger.");
}

if (!/zod-crud 1\.0 패키지 릴리스를 막는 미해결 외부 사용 gap은 없다/.test(apiUsageGaps)) {
  fail("api usage gaps: 1.0 release-blocker classification is missing.");
}

if (/Decision needed/.test(apiUsageGaps)) {
  fail("api usage gaps: remaining decisions must be classified as post-1.0 work.");
}

if (
  !/G-001: `doc\.ops` facade drift[\s\S]*상태: zod-crud 1\.0 root 계약에서는 닫힘/.test(apiUsageGaps)
  || !/G-002: `doc\.commands` facade drift[\s\S]*상태: zod-crud 1\.0 root 계약에서는 닫힘/.test(apiUsageGaps)
) {
  fail("api usage gaps: legacy doc.ops/doc.commands drift must be closed for the 1.0 root contract.");
}

if (!/상태: 프로덕션 root 계약에서는 닫힘/.test(apiUsageGaps)) {
  fail("api usage gaps: support type export gap is not closed.");
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

if (!/react-markdown/.test(markdownViewer) || !/remarkGfm/.test(markdownViewer) || !/rehypeSlug/.test(markdownViewer) || !/<table/.test(markdownViewer)) {
  fail("MarkdownViewer: table rendering support missing.");
}

if (/max-h-96/.test(workbenchPlayground)) {
  fail("workbench playground: JSON code output must not pin a max height.");
}

if (!/getAllByRole\("table"\)/.test(siteShellTest)) {
  fail("site shell test: Markdown table rendering assertion missing.");
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
  ["/docs", "zod-crud Docs - zod-crud", "User guide to zod-crud's schema-first editing flow, can* checks, changes, results, and history."],
  ["/docs/tutorial", "Tutorial - zod-crud", "Step-by-step zod-crud tutorial for building a small card editor with schema checks, selection, clipboard, and history."],
  ["/docs/api", "zod-crud API - zod-crud", "Public zod-crud API reference for document changes, can* checks, selection, clipboard, history, Pointer, and JSONPath."],
  ["/playground", "Workbench - zod-crud", "Interactive zod-crud workbench for trying document operations, can* checks, selection, clipboard, history, schema guards, and JSONPath search."],
  ["/playground/outliner", "Outliner demo - zod-crud", "Keyboard-first outliner demo showing zod-crud selection, clipboard, history, structure edits, and JSON document movement."],
  ["/playground/mobile-cms", "Mobile CMS demo - zod-crud", "Mobile CMS demo showing schema-guarded page editing, content block movement, paste targets, and zod-crud document history."],
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
) {
  fail("site app: route docs and demos must be lazy-loaded from the overview page.");
}

if (/import\s+\{[^}]*ApiCollection|import\s+\{[^}]*Outliner|from "@zod-crud\/mobile-cms"/.test(siteApp)) {
  fail("site app: demo packages must not be statically imported into the overview bundle.");
}

if (/md:overflow-hidden/.test(siteApp) || /id="main-content" className="[^"]*overflow/.test(siteApp)) {
  fail("site app: window must be the official vertical scroll owner.");
}

if (!/window\.scrollTo\(\{ left: 0, top: 0 \}\)/.test(siteApp) || !/md:sticky md:top-0 md:h-screen/.test(siteApp)) {
  fail("site app: route navigation and desktop sidebar must match the window scroll model.");
}

if (/md:overflow-auto/.test(playgroundRoute)) {
  fail("playground route: must not create a nested vertical scroll owner.");
}

if (!/document\.title/.test(siteShellTest) || !/name="description"/.test(siteShellTest) || !/og:description/.test(siteShellTest) || !/og:url/.test(siteShellTest) || !/twitter:description/.test(siteShellTest) || !/canonical/.test(siteShellTest)) {
  fail("site shell test: missing client-side route metadata coverage.");
}

if (!/markdownHeadings/.test(docsRoute) || !/On this page/.test(docsRoute) || !/Documentation pages/.test(docsRoute) || !/Documentation sections/.test(docsRoute) || !/작업별-진입점/.test(siteShellTest)) {
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

if (!/--strictPort/.test(playwrightConfig) || !/PLAYWRIGHT_REUSE_EXISTING_SERVER/.test(playwrightConfig) || !/reuseExistingServer/.test(playwrightConfig)) {
  fail("playwright config: browser tests must use a strict fresh server unless reuse is explicitly requested.");
}

if (
  !/defers demo and engine code/.test(browserSiteTest)
  || !/InterfaceWorkbench\.playground/.test(browserSiteTest)
  || !/toHaveTitle\("zod-crud Docs - zod-crud"\)/.test(browserSiteTest)
  || !/toHaveTitle\("zod-crud API - zod-crud"\)/.test(browserSiteTest)
  || !/sticky desktop navigation/.test(browserSiteTest)
  || !/mainOverflowY/.test(browserSiteTest)
  || !/siteNavTop/.test(browserSiteTest)
  || !/docsNavTop/.test(browserSiteTest)
  || !/window\.scrollY/.test(browserSiteTest)
) {
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

if (!/npm run verify/.test(pagesWorkflow) || !/site:evaluate:live/.test(rootPackageJson) || !/actions\/checkout@v6/.test(pagesWorkflow) || !/actions\/setup-node@v6/.test(pagesWorkflow) || !/upload-pages-artifact@v5/.test(pagesWorkflow)) {
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

if (!/history\.transaction[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation으로 바꾸지는 않습니다/.test(surfaces.readme)) {
  fail("readme: missing burst-edit guidance that transaction is not a validation batch.");
}
if (!/history\.transaction[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation/.test(surfaces.site)) {
  fail("site: missing burst-edit guidance that transaction is not a validation batch.");
}
if (!/알려진 burst edit[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation/.test(surfaces.spec)) {
  fail("spec: missing burst-edit guidance that transaction is not a validation batch.");
}
if (!/Burst edit[\s\S]*반복 `doc\.patch\(\.\.\.\)` 호출을 한 번의 schema validation/.test(surfaces.llms)) {
  fail("llms: missing burst-edit guidance that transaction is not a validation batch.");
}

if (process.exitCode === undefined) {
  console.log(`docs evaluation ok: ${completed}/100 loops recorded`);
}
