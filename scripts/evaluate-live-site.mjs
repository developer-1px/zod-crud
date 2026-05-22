const siteUrl = (process.env.SITE_URL ?? "https://developer-1px.github.io/zod-crud").replace(/\/$/, "");
const attempts = Number(process.env.SITE_LIVE_ATTEMPTS ?? "18");
const delayMs = Number(process.env.SITE_LIVE_DELAY_MS ?? "10000");

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

  const docs = await fetchText("/docs", [200, 404]);
  if (!/<title>zod-crud - Headless JSON editing<\/title>/.test(docs)) {
    fail("live /docs fallback shell is missing the production title.");
  }

  const llms = await fetchText("/llms.txt");
  if (!/Stable Identity/.test(llms) || !/Import Boundary/.test(llms)) {
    fail("live llms.txt is missing expected content.");
  }

  const sitemap = await fetchText("/sitemap.xml");
  for (const path of ["/", "/docs", "/playground", "/playground/outliner"]) {
    if (!sitemap.includes(`<loc>${siteUrl}${path === "/" ? "/" : path}</loc>`)) {
      fail(`live sitemap missing ${path}.`);
    }
  }
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
