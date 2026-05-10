import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { Outliner } from "../src/index.js";

const firstItem = "Enter — insert sibling after focus";
const secondItem = "Tab — demote (move into prev sibling)";
const thirdItem = "Shift+Tab — promote (move out to parent's sibling)";
const selectionItem = "Selection";
const firstSelectionChild = "Click — focus single";
const editedFirstItem = "Edited first item";

afterEach(() => {
  cleanup();
});

function renderOutliner() {
  render(<Outliner />);
  expect(screen.getByRole("tree", { name: "outline" })).toBeTruthy();
}

function statusText() {
  return document.querySelector(".status")?.textContent ?? "";
}

function tree() {
  return screen.getByRole("tree");
}

function treeTexts() {
  return within(tree())
    .getAllByRole("textbox")
    .map((input) => (input as HTMLInputElement).value);
}

function treeItems() {
  return within(tree()).getAllByRole("treeitem");
}

function selectedRows() {
  return treeItems().filter((row) => row.getAttribute("aria-selected") === "true");
}

function rowForText(text: string) {
  const input = screen.getByDisplayValue(text);
  const row = input.closest("[role='treeitem']");
  if (!row) throw new Error(`No tree row for ${text}`);
  return row as HTMLElement;
}

function markerForText(text: string) {
  const marker = rowForText(text).querySelector(".marker");
  if (!(marker instanceof HTMLElement)) throw new Error(`No marker for ${text}`);
  return marker;
}

async function clickText(text: string) {
  const user = userEvent.setup();
  const input = screen.getByDisplayValue(text);
  await user.click(input);
  await waitFor(() => expect(document.activeElement).toBe(input));
  return user;
}

async function replaceFocusedText(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.keyboard("{Backspace}".repeat(from.length));
  if (to !== "") await user.keyboard(to);
}

describe("outliner keyboard and mouse interactions", () => {
  test("mouse click enters edit mode, Escape returns to select mode, and arrow keys move focus", async () => {
    renderOutliner();
    const user = await clickText(firstItem);

    expect(statusText()).toMatch(/mode = edit/);
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{Escape}");
    expect(statusText()).toMatch(/mode = select/);

    await user.keyboard("{ArrowDown}");
    expect(statusText()).toMatch(/focus =\s*\/children\/1/);

    await user.keyboard("{ArrowUp}");
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{End}");
    expect(statusText()).toMatch(/focus =\s*\/children\/6\/children\/1/);

    await user.keyboard("{Home}");
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);
  });

  test.fails("ArrowRight and ArrowLeft navigate between a parent row and its first child", async () => {
    renderOutliner();
    const user = await clickText(selectionItem);
    await user.keyboard("{Escape}");

    await user.keyboard("{ArrowRight}");
    expect(statusText()).toMatch(/focus =\s*\/children\/4\/children\/0/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue(firstSelectionChild)));

    await user.keyboard("{ArrowLeft}");
    expect(statusText()).toMatch(/focus =\s*\/children\/4/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue(selectionItem)));
  });

  test("Shift+click range selection and Ctrl+click toggle are visible in the DOM", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    expect(statusText()).toMatch(/selection =\s*1/);

    await user.keyboard("{Shift>}");
    await user.click(screen.getByDisplayValue(secondItem));
    await user.keyboard("{/Shift}");
    expect(statusText()).toMatch(/selection =\s*2/);
    expect(selectedRows()).toHaveLength(2);

    await user.keyboard("{Control>}");
    await user.click(screen.getByDisplayValue(firstItem));
    await user.keyboard("{/Control}");
    expect(statusText()).toMatch(/selection =\s*1/);
  });

  test("Ctrl+A selects all visible non-root rows in select mode", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Control>}a{/Control}");

    expect(statusText()).toMatch(/selection =\s*17/);
    expect(selectedRows()).toHaveLength(17);
  });

  test("Shift+Arrow extends selection through visible rows", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(statusText()).toMatch(/focus =\s*\/children\/1/);
    expect(statusText()).toMatch(/selection =\s*2/);
    expect(selectedRows()).toHaveLength(2);

    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");

    expect(statusText()).toMatch(/focus =\s*\/children\/0/);
    expect(statusText()).toMatch(/selection =\s*1/);
  });

  test.fails("pasting with an empty clipboard reports an error through rendered status", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Control>}v{/Control}");

    expect(screen.getByText("path_not_found: clipboard is empty")).toBeTruthy();
  });

  test("copy and paste as sibling operate through keyboard shortcuts and rendered rows", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Control>}c{/Control}");
    expect(statusText()).toMatch(/clipboard =\s*copy 1/);

    await user.click(markerForText(secondItem));
    await user.keyboard("{Control>}v{/Control}");

    expect(treeTexts().filter((text) => text === firstItem)).toHaveLength(2);
  });

  test.fails("Tab demotes a row and Shift+Tab promotes it back through keyboard input", async () => {
    renderOutliner();
    const user = await clickText(secondItem);

    await user.keyboard("{Tab}");
    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("2");

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("1");
  });

  test.fails("Ctrl+ArrowUp and Ctrl+ArrowDown move the focused row among siblings", async () => {
    renderOutliner();
    const user = await clickText(secondItem);

    await user.keyboard("{Control>}{ArrowUp}{/Control}");
    expect(treeTexts().slice(1, 3)).toEqual([secondItem, firstItem]);

    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(treeTexts().slice(1, 3)).toEqual([firstItem, secondItem]);
  });

  test("cut and paste as child move the selected row under the focused target", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(secondItem));
    await user.keyboard("{Control>}x{/Control}");
    expect(statusText()).toMatch(/clipboard =\s*cut 1/);

    await user.click(markerForText(selectionItem));
    await user.keyboard("{Control>}{Shift>}v{/Shift}{/Control}");

    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("2");
    expect(statusText()).toMatch(/clipboard =\s*—/);
  });

  test("Backspace on an empty edited row removes that row through keyboard input", async () => {
    renderOutliner();
    const before = treeItems().length;
    const user = await clickText(firstItem);

    await replaceFocusedText(user, firstItem, "");
    await user.keyboard("{Backspace}");

    expect(treeItems()).toHaveLength(before - 1);
    expect(treeTexts()).not.toContain(firstItem);
  });

  test("Backspace removes a mouse-selected range of rows", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByDisplayValue(thirdItem));
    await user.keyboard("{/Shift}");
    expect(statusText()).toMatch(/selection =\s*3/);

    await user.keyboard("{Backspace}");

    expect(treeTexts()).not.toContain(firstItem);
    expect(treeTexts()).not.toContain(secondItem);
    expect(treeTexts()).not.toContain(thirdItem);
  });

  test("reset button restores the initial rendered document after keyboard edits", async () => {
    renderOutliner();
    const user = await clickText(firstItem);

    await replaceFocusedText(user, firstItem, editedFirstItem);
    expect(treeTexts()).toContain(editedFirstItem);

    await user.click(screen.getByRole("button", { name: "reset" }));

    expect(treeTexts()).toContain(firstItem);
    expect(treeTexts()).not.toContain(editedFirstItem);
    expect(statusText()).toMatch(/mode = select/);
  });
});
