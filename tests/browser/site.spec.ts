import { expect, test } from "@playwright/test";

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

test("official docs route renders with route metadata in a real browser", async ({ page }) => {
  await page.goto("/docs");

  await expect(page).toHaveTitle("zod-crud API - zod-crud");
  await expect(page.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
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
