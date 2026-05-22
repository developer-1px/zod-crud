import { expect, test, type Page } from "@playwright/test";

test("official overview defers demo and engine code until a demo route opens", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "zod-crud" })).toBeVisible();
  await expect(page.getByText("Interface bench")).toHaveCount(0);
  expect(requests.some(isDemoOrEngineRequest)).toBe(false);

  await page.getByRole("link", { name: "Workbench" }).first().click();
  await expect(page.getByText("Interface bench")).toBeVisible();
  expect(requests.some((url) => url.includes("InterfaceWorkbench.playground"))).toBe(true);
});

test("official docs routes render with route metadata in a real browser", async ({ page }) => {
  await page.goto("/docs");

  await expect(page).toHaveTitle("zod-crud Docs - zod-crud");
  await expect(page.getByRole("heading", { level: 1, name: "zod-crud Docs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "배경" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Documentation pages" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();

  await page.getByRole("link", { name: "API reference" }).first().click();
  await expect(page).toHaveTitle("zod-crud API - zod-crud");
  await expect(page.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
});

test("official site uses window scroll with sticky desktop navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/docs/api");
  await expect(page.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 1200));

  await expect.poll(() => scrollSnapshot(page)).toMatchObject({
    windowScrollY: 1200,
    mainOverflowY: "visible",
    siteNavTop: 0,
    docsNavTop: 16,
  });

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page).toHaveTitle("zod-crud - Headless JSON editing");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

function isDemoOrEngineRequest(url: string): boolean {
  return [
    "/src/playgrounds/InterfaceWorkbench.playground",
    "/apps/outliner/src/",
    "/apps/mobile-cms/src/",
    "/apps/api-collection/src/",
    "/packages/zod-crud/src/index.ts",
    "/packages/zod-crud/src/react.ts",
  ].some((part) => url.includes(part));
}

async function scrollSnapshot(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("#main-content");
    const siteNav = document.querySelector('nav[aria-label="Site navigation"]');
    const docsNav = document.querySelector('nav[aria-label="Documentation pages"]');

    return {
      windowScrollY: Math.round(window.scrollY),
      mainOverflowY: main ? getComputedStyle(main).overflowY : null,
      siteNavTop: siteNav ? Math.round(siteNav.getBoundingClientRect().top) : null,
      docsNavTop: docsNav ? Math.round(docsNav.getBoundingClientRect().top) : null,
    };
  });
}
