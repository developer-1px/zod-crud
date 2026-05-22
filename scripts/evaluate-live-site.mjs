import { readFileSync } from "node:fs";

const siteUrl = (process.env.SITE_URL ?? "https://developer-1px.github.io/zod-crud").replace(/\/$/, "");
const attempts = Number(process.env.SITE_LIVE_ATTEMPTS ?? "18");
const delayMs = Number(process.env.SITE_LIVE_DELAY_MS ?? "10000");
const routes = JSON.parse(readFileSync(new URL("../apps/site/src/site-routes.json", import.meta.url), "utf8"));

function fail(message) {
  throw new Error(message);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(path, allowedStatuses = [200]) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${siteUrl}${path}${separator}live_check=${Date.now()}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!allowedStatuses.includes(response.status)) {
    fail(`${path} returned HTTP ${response.status}.`);
  }
  return response.text();
}

async function checkOnce() {
  const index = await fetchText("/");
  for (const pattern of [
    /<title>zod-crud - Headless JSON editing<\/title>/,
    /name="description"/,
    /property="og:title"/,
    /rel="icon"/,
    /rel="manifest"/,
  ]) {
    if (!pattern.test(index)) fail(`live index missing ${pattern}.`);
  }

  for (const route of routes) {
    const routeHtml = route.path === "/" ? index : await fetchText(route.path);
    const canonical = routeUrl(route.path);
    if (!routeHtml.includes(`<title>${route.title}</title>`)) {
      fail(`live ${route.path} shell is missing the route title.`);
    }
    if (!routeHtml.includes(`rel="canonical" href="${canonical}"`)) {
      fail(`live ${route.path} shell is missing the route canonical.`);
    }
    if (!routeHtml.includes(`property="og:url" content="${canonical}"`)) {
      fail(`live ${route.path} shell is missing the route og:url.`);
    }
  }

  const llms = await fetchText("/llms.txt");
  if (!/Stable Identity/.test(llms) || !/Import Boundary/.test(llms)) {
    fail("live llms.txt is missing expected content.");
  }

  const sitemap = await fetchText("/sitemap.xml");
  for (const route of routes) {
    const loc = routeUrl(route.path);
    if (!sitemap.includes(`<loc>${loc}</loc>`)) {
      fail(`live sitemap missing ${route.path}.`);
    }
  }
}

function routeUrl(path) {
  return path === "/" ? `${siteUrl}/` : `${siteUrl}${path}`;
}

let lastError = null;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await checkOnce();
    console.log("live site evaluation ok");
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < attempts) {
      console.log(`live site evaluation retry ${attempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(delayMs);
    }
  }
}

if (lastError) {
  console.error(lastError instanceof Error ? lastError.message : String(lastError));
  process.exitCode = 1;
}
