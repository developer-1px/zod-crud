import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { once } from "node:events";
import { validateSiteRoutes } from "./site-route-checks.mjs";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "apps/site/dist");
const expectedBase = normalizeBase(process.env.SITE_BASE ?? "/json-document/");
const expectedSiteUrl = (process.env.SITE_URL ?? "https://developer-1px.github.io/json-document").replace(/\/$/, "");
const routes = JSON.parse(readFileSync(join(root, "apps/site/src/site-routes.json"), "utf8"));
validateSiteRoutes(routes, fail);
const seenAssets = new Set();

function fail(message) {
  throw new Error(message);
}

function normalizeBase(value) {
  if (value === "" || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

function publicUrl(path) {
  const routePath = path === "/" ? "/" : path;
  if (expectedBase === "/") return routePath;
  return `${expectedBase.replace(/\/$/, "")}${routePath}`;
}

function routeUrl(path) {
  return path === "/" ? `${expectedSiteUrl}/` : `${expectedSiteUrl}${path}`;
}

function publicPathFromRequest(pathname) {
  if (expectedBase === "/") return pathname;
  const base = expectedBase.replace(/\/$/, "");
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return null;
}

function resolveFile(publicPath) {
  const relative = decodeURIComponent(publicPath).replace(/^\/+/, "");
  const candidates = relative === ""
    ? ["index.html"]
    : [relative, `${relative}/index.html`];

  for (const candidate of candidates) {
    const file = normalize(join(dist, candidate));
    if (!file.startsWith(`${dist}${sep}`) && file !== dist) return null;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }

  return null;
}

function contentType(file) {
  switch (extname(file)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const publicPath = publicPathFromRequest(url.pathname);
  const file = publicPath === null ? null : resolveFile(publicPath);

  if (!file) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }

  response.setHeader("content-type", contentType(file));
  createReadStream(file).pipe(response);
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const address = server.address();
  if (!address || typeof address === "string") fail("HTTP smoke server did not expose a TCP port.");
  const origin = `http://127.0.0.1:${address.port}`;

  for (const route of routes) {
    const html = await fetchRequiredText(origin, publicUrl(route.path), "text/html");
    const canonical = routeUrl(route.path);
    if (!html.includes(`<title>${route.title}</title>`)) fail(`HTTP ${route.path} missing route title.`);
    if (!hasMetaContent(html, "name", "description", route.description)) fail(`HTTP ${route.path} missing route description.`);
    if (!html.includes(`rel="canonical" href="${canonical}"`)) fail(`HTTP ${route.path} missing route canonical.`);
    if (!hasMetaContent(html, "property", "og:description", route.description)) fail(`HTTP ${route.path} missing route og:description.`);
    if (!html.includes(`property="og:url" content="${canonical}"`)) fail(`HTTP ${route.path} missing route og:url.`);
    if (!hasMetaContent(html, "name", "twitter:description", route.description)) fail(`HTTP ${route.path} missing route twitter:description.`);
    if (/%BASE_URL%/.test(html)) fail(`HTTP ${route.path} contains an unexpanded Vite base placeholder.`);

    for (const asset of localAssetPaths(html)) seenAssets.add(asset);
  }

  for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/favicon.svg", "/site.webmanifest"]) {
    seenAssets.add(publicUrl(path));
  }

  for (const asset of seenAssets) {
    await fetchRequiredText(origin, asset);
  }

  console.log("site HTTP evaluation ok");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function fetchRequiredText(origin, path, expectedContentType) {
  const response = await fetch(`${origin}${path}`);
  if (response.status !== 200) fail(`HTTP ${path} returned ${response.status}.`);
  const actualContentType = response.headers.get("content-type") ?? "";
  if (expectedContentType && !actualContentType.includes(expectedContentType)) {
    fail(`HTTP ${path} returned unexpected content-type ${actualContentType}.`);
  }
  return response.text();
}

function localAssetPaths(source) {
  return Array.from(
    source.matchAll(/\b(?:src|href)="([^"]+)"/g),
    (match) => match[1],
  ).filter((path) => path && !/^(?:https?:|mailto:|#)/.test(path));
}

function hasMetaContent(source, attribute, key, content) {
  return new RegExp(`<meta\\s+${attribute}="${escapeRegExp(key)}"\\s+content="${escapeRegExp(content)}"`).test(source);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
