import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "apps/site/dist");
const expectedBase = normalizeBase(process.env.SITE_BASE ?? "/");
const expectedSiteUrl = (process.env.SITE_URL ?? "https://developer-1px.github.io/zod-crud").replace(/\/$/, "");
const routes = [
  { path: "/", file: "index.html", title: "zod-crud - Headless JSON editing" },
  { path: "/docs", file: "docs/index.html", title: "zod-crud API - zod-crud" },
  { path: "/playground", file: "playground/index.html", title: "Workbench - zod-crud" },
  { path: "/playground/outliner", file: "playground/outliner/index.html", title: "Outliner demo - zod-crud" },
  { path: "/playground/mobile-cms", file: "playground/mobile-cms/index.html", title: "Mobile CMS demo - zod-crud" },
  { path: "/playground/api-collection", file: "playground/api-collection/index.html", title: "API collection demo - zod-crud" },
];

function read(path) {
  return readFileSync(join(dist, path), "utf8");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function normalizeBase(value) {
  if (value === "" || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

function routeUrl(path) {
  return path === "/" ? `${expectedSiteUrl}/` : `${expectedSiteUrl}${path}`;
}

for (const file of [
  ...routes.map((route) => route.file),
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "favicon.svg",
  "site.webmanifest",
]) {
  if (!existsSync(join(dist, file))) fail(`site dist missing ${file}.`);
}

const index = read("index.html");
const fallback = read("404.html");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const manifest = JSON.parse(read("site.webmanifest"));

for (const pattern of [
  /<title>zod-crud - Headless JSON editing<\/title>/,
  /name="description"/,
  /property="og:title"/,
  /property="og:description"/,
  /name="twitter:card"/,
  /rel="canonical"/,
  /rel="icon"/,
  /rel="manifest"/,
]) {
  if (!pattern.test(index)) fail(`site dist index missing ${pattern}.`);
}

if (/%BASE_URL%/.test(index)) fail("site dist index contains an unexpanded Vite base placeholder.");

if (fallback !== index) fail("site dist 404.html must match index.html for SPA deep links.");
for (const route of routes) {
  const routeHtml = read(route.file);
  const canonical = routeUrl(route.path);
  if (!routeHtml.includes(`<title>${route.title}</title>`)) fail(`site dist ${route.file} missing route title.`);
  if (!routeHtml.includes(`rel="canonical" href="${canonical}"`)) fail(`site dist ${route.file} missing route canonical.`);
  if (!routeHtml.includes(`property="og:url" content="${canonical}"`)) fail(`site dist ${route.file} missing route og:url.`);
  verifyLocalAssets(routeHtml, route.file);
}

if (!robots.includes(`Sitemap: ${expectedSiteUrl}/sitemap.xml`)) {
  fail("site dist robots.txt missing production sitemap URL.");
}

for (const route of routes) {
  const loc = routeUrl(route.path);
  if (!sitemap.includes(`<loc>${loc}</loc>`)) fail(`site dist sitemap missing ${loc}.`);
}

if (
  manifest.name !== "zod-crud"
  || manifest.short_name !== "zod-crud"
  || manifest.theme_color !== "#fafaf9"
  || !Array.isArray(manifest.icons)
  || manifest.icons.length === 0
) {
  fail("site dist manifest is incomplete.");
}

if (expectedBase !== "/") {
  for (const path of [
    `${expectedBase}assets/`,
    `${expectedBase}favicon.svg`,
    `${expectedBase}site.webmanifest`,
  ]) {
    if (!index.includes(path)) fail(`site dist index missing expected base path ${path}.`);
  }
}

for (const publicPath of localAssetPaths(index)) {
  const relativePath = relativeDistPath(publicPath, "index.html");
  if (relativePath === null) continue;
  if (!existsSync(join(dist, relativePath))) {
    fail(`site dist index references missing asset ${publicPath}.`);
  }
}

if (process.exitCode === undefined) {
  console.log("site evaluation ok");
}

function verifyLocalAssets(source, label) {
  for (const publicPath of localAssetPaths(source)) {
    const relativePath = relativeDistPath(publicPath, label);
    if (relativePath === null) continue;
    if (!existsSync(join(dist, relativePath))) {
      fail(`site dist ${label} references missing asset ${publicPath}.`);
    }
  }
}

function localAssetPaths(source) {
  return Array.from(
    source.matchAll(/\b(?:src|href)="([^"]+)"/g),
    (match) => match[1],
  ).filter((path) => path && !/^(?:https?:|mailto:|#)/.test(path));
}

function relativeDistPath(publicPath, label) {
  if (expectedBase === "/") {
    return publicPath.startsWith("/") ? publicPath.slice(1) : publicPath;
  }

  if (!publicPath.startsWith(expectedBase)) {
    fail(`site dist ${label} local asset does not use expected base ${expectedBase}: ${publicPath}.`);
    return null;
  }

  return publicPath.slice(expectedBase.length);
}
