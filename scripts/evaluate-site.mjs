import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "apps/site/dist");
const expectedBase = normalizeBase(process.env.SITE_BASE ?? "/");

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

for (const file of [
  "index.html",
  "404.html",
  "docs/index.html",
  "playground/index.html",
  "playground/outliner/index.html",
  "playground/mobile-cms/index.html",
  "playground/api-collection/index.html",
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
for (const route of [
  { file: "docs/index.html", title: "zod-crud API - zod-crud", canonical: "https://developer-1px.github.io/zod-crud/docs" },
  { file: "playground/index.html", title: "Workbench - zod-crud", canonical: "https://developer-1px.github.io/zod-crud/playground" },
  { file: "playground/outliner/index.html", title: "Outliner demo - zod-crud", canonical: "https://developer-1px.github.io/zod-crud/playground/outliner" },
  { file: "playground/mobile-cms/index.html", title: "Mobile CMS demo - zod-crud", canonical: "https://developer-1px.github.io/zod-crud/playground/mobile-cms" },
  { file: "playground/api-collection/index.html", title: "API collection demo - zod-crud", canonical: "https://developer-1px.github.io/zod-crud/playground/api-collection" },
]) {
  const routeHtml = read(route.file);
  if (!routeHtml.includes(`<title>${route.title}</title>`)) fail(`site dist ${route.file} missing route title.`);
  if (!routeHtml.includes(`rel="canonical" href="${route.canonical}"`)) fail(`site dist ${route.file} missing route canonical.`);
  if (!routeHtml.includes(`property="og:url" content="${route.canonical}"`)) fail(`site dist ${route.file} missing route og:url.`);
  verifyLocalAssets(routeHtml, route.file);
}

if (!/Sitemap: https:\/\/developer-1px\.github\.io\/zod-crud\/sitemap\.xml/.test(robots)) {
  fail("site dist robots.txt missing production sitemap URL.");
}

for (const route of [
  "https://developer-1px.github.io/zod-crud/",
  "https://developer-1px.github.io/zod-crud/docs",
  "https://developer-1px.github.io/zod-crud/playground",
  "https://developer-1px.github.io/zod-crud/playground/outliner",
  "https://developer-1px.github.io/zod-crud/playground/mobile-cms",
  "https://developer-1px.github.io/zod-crud/playground/api-collection",
]) {
  if (!sitemap.includes(`<loc>${route}</loc>`)) fail(`site dist sitemap missing ${route}.`);
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
