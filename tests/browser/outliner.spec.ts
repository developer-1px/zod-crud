import { expect, test } from "@playwright/test";

const firstItem = "Enter edit; Shift/Cmd+Enter insert";
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
  await expect(page.locator(".status")).toContainText("mode = select");
  await expect(page.locator(".status")).toContainText("focus = /children/0");
  await expect(treeTextboxes).toHaveCount(18);

  await firstRowText.press("Shift+Enter");
  await expect(page.locator(".status")).toContainText("focus = /children/1");

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator(".status")).toContainText("focus = /children/2");

  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");

  await expect(treeTextboxes).toHaveCount(18);
  await expect(treeTextboxes.nth(1)).toHaveValue(firstItem);

  await treeTextboxes.nth(1).click();
  await page.keyboard.press("ControlOrMeta+D");
  await expect(treeTextboxes).toHaveCount(19);
  await expect(page.locator(".status")).toContainText("focus = /children/1");

  await page.keyboard.press("ControlOrMeta+Z");
  await expect(treeTextboxes).toHaveCount(18);

  await treeTextboxes.nth(1).click();
  await page.keyboard.press("ControlOrMeta+C");
  await treeTextboxes.nth(2).click();
  await page.keyboard.press("ControlOrMeta+V");
  await page.keyboard.press("ControlOrMeta+V");
  await expect(treeTextboxes).toHaveCount(20);
  await expect.poll(() =>
    treeTextboxes.evaluateAll(
      (inputs, expected) =>
        inputs.filter((input) => input instanceof HTMLInputElement && input.value === expected).length,
      firstItem,
    ),
  ).toBe(3);
  await expect(page.locator(".toast")).not.toContainText(/not_serializable|circular/i);
});
