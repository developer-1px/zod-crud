import { expect, test } from "@playwright/test";

const firstItem = "Enter — insert sibling after focus";
const editedFirstItem = "Edited first item";

test("outliner supports keyboard editing and undo in a real browser", async ({ page }) => {
  await page.goto("/playground/outliner");

  await expect(page.getByRole("heading", { name: "zod-crud outliner" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "outline" })).toBeVisible();

  const treeTextboxes = page.getByRole("tree").getByRole("textbox");
  await expect(treeTextboxes).toHaveCount(18);

  const firstRowText = treeTextboxes.nth(1);
  await expect(firstRowText).toHaveValue(firstItem);
  await firstRowText.click();
  await expect(page.locator(".status")).toContainText("mode = select");
  await expect(page.locator(".status")).toContainText("focus = /children/0");

  await firstRowText.press("Enter");
  await expect(page.locator(".status")).toContainText("mode = edit");

  await firstRowText.fill(editedFirstItem);
  await expect(firstRowText).toHaveValue(editedFirstItem);

  await firstRowText.press("Enter");
  await expect(page.locator(".status")).toContainText("focus = /children/1");

  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");

  await expect(treeTextboxes).toHaveCount(18);
  await expect(treeTextboxes.nth(1)).toHaveValue(firstItem);
});
