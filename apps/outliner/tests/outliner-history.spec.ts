import { expect, test, type Page } from "@playwright/test";

const firstItem = "Enter — insert sibling after focus";
const editedFirstItem = "Edited first item";

async function openOutliner(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "zod-crud outliner" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "outline" })).toBeVisible();
}

async function clickText(page: Page, text: string) {
  await inputWithValue(page, text).click();
}

function inputWithValue(page: Page, value: string) {
  return page.locator(`xpath=//input[@value=${xpathString(value)}]`);
}

function xpathString(value: string) {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value.split("'").map((part) => `'${part}'`).join(`, "'", `)})`;
}

async function replaceFocusedTextWithKeyboard(page: Page, text: string) {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type(text);
}

function selectedRows(page: Page) {
  return page.locator("li[role='treeitem'][aria-selected='true']");
}

async function visibleTreeTexts(page: Page) {
  return page
    .getByRole("treeitem")
    .locator("input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function expectStatus(page: Page, pattern: RegExp) {
  await expect(page.locator(".status")).toContainText(pattern);
}

test.describe("outliner editor history", () => {
  test("keeps DOM selection, aria-selected, and selection count aligned after keyboard structure edits", async ({ page }) => {
    await openOutliner(page);

    await clickText(page, firstItem);
    await replaceFocusedTextWithKeyboard(page, editedFirstItem);
    await page.keyboard.press("Enter");

    await expectStatus(page, /selection =\s*1/);
    await expect(selectedRows(page)).toHaveCount(1);

    await page.keyboard.press("Tab");

    await expectStatus(page, /selection =\s*1/);
    await expect(selectedRows(page)).toHaveCount(1);
  });

  test("undo restores the full editor transaction: text, node structure, focus, and selection", async ({ page }) => {
    await openOutliner(page);

    await clickText(page, firstItem);
    await replaceFocusedTextWithKeyboard(page, editedFirstItem);
    await page.keyboard.press("Enter");

    await expect.poll(() => visibleTreeTexts(page)).toContain(editedFirstItem);
    await expect.poll(() => visibleTreeTexts(page)).toContain("");

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+Z`);

    await expect.poll(() => visibleTreeTexts(page)).toContain(firstItem);
    await expect.poll(() => visibleTreeTexts(page)).not.toContain(editedFirstItem);
    await expect(visibleTreeTexts(page)).resolves.not.toContain("");
    await expectStatus(page, /focus =\s*\/children\/0/);
    await expectStatus(page, /selection =\s*1/);
    await expect(selectedRows(page)).toHaveCount(1);
  });

  test("redo restores the same full editor transaction through the rendered DOM", async ({ page }) => {
    await openOutliner(page);

    await clickText(page, firstItem);
    await replaceFocusedTextWithKeyboard(page, editedFirstItem);
    await page.keyboard.press("Enter");

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+Z`);
    await page.keyboard.press(`${modifier}+Shift+Z`);

    await expect.poll(() => visibleTreeTexts(page)).toContain(editedFirstItem);
    await expect.poll(() => visibleTreeTexts(page)).toContain("");
    await expectStatus(page, /focus =\s*\/children\/1/);
    await expectStatus(page, /selection =\s*1/);
    await expect(selectedRows(page)).toHaveCount(1);
  });
});
