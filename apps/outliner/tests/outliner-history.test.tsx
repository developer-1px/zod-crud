import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { Outliner } from "../src/index.js";

const firstItem = "Enter — edit; Shift+Enter / Cmd+Enter — insert sibling";
const secondItem = "Tab — demote (move into prev sibling)";
const editedFirstItem = "Edited first item";

afterEach(() => {
  cleanup();
});

function renderOutliner() {
  render(<Outliner />);
  expect(screen.getByRole("heading", { name: "zod-crud outliner" })).toBeTruthy();
  expect(screen.getByRole("tree", { name: "outline" })).toBeTruthy();
}

function statusText() {
  return document.querySelector(".status")?.textContent ?? "";
}

function treeTexts() {
  return within(screen.getByRole("tree"))
    .getAllByRole("textbox")
    .map((input) => (input as HTMLInputElement).value);
}

function selectedRows() {
  return within(screen.getByRole("tree")).getAllByRole("treeitem").filter((row) => row.getAttribute("aria-selected") === "true");
}

async function editFirstItemAndInsertSibling() {
  const user = userEvent.setup();
  const firstInput = screen.getByDisplayValue(firstItem);

  await user.click(firstInput);
  await waitFor(() => expect(document.activeElement).toBe(firstInput));
  // click 정책 = select 모드 → 편집은 Enter 로 진입
  await user.keyboard("{Enter}");
  await waitFor(() => expect((firstInput as HTMLInputElement).readOnly).toBe(false));
  fireEvent.change(firstInput, { target: { value: editedFirstItem } });
  await waitFor(() => expect((firstInput as HTMLInputElement).value).toBe(editedFirstItem));
  // edit 모드에서 sibling 추가는 Shift+Enter.
  await user.keyboard("{Shift>}{Enter}{/Shift}");
  await waitFor(() => expect(treeTexts()).toContain(""));

  return user;
}

describe("outliner editor history", () => {
  test("keeps DOM selection, aria-selected, and selection count aligned after keyboard structure edits", async () => {
    renderOutliner();
    const user = userEvent.setup();
    const secondInput = screen.getByDisplayValue(secondItem);

    await user.click(secondInput);
    await waitFor(() => expect(document.activeElement).toBe(secondInput));
    expect(statusText()).toMatch(/selection =\s*1/);
    expect(selectedRows()).toHaveLength(1);

    await user.keyboard("{Tab}");

    expect(statusText()).toMatch(/selection =\s*1/);
    expect(selectedRows()).toHaveLength(1);
  });

  test("undo restores the full editor transaction: text, node structure, focus, and selection", async () => {
    renderOutliner();
    const user = await editFirstItemAndInsertSibling();

    expect(treeTexts()).toContain(editedFirstItem);
    expect(treeTexts()).toContain("");

    // 새 정책: 각 사용자 액션이 별 entry. 텍스트 편집은 같은 path 안에서 coalesce 됨.
    // 텍스트 편집 + Shift+Enter(insert-sibling) 는 2 개 entry → 2 회 undo 필요.
    await user.keyboard("{Control>}z{/Control}"); // insert-sibling 원복
    await user.keyboard("{Control>}z{/Control}"); // 텍스트 편집 원복

    expect(treeTexts()).toContain(firstItem);
    expect(treeTexts()).not.toContain(editedFirstItem);
    expect(treeTexts()).not.toContain("");
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);
    expect(statusText()).toMatch(/selection =\s*1/);
    expect(selectedRows()).toHaveLength(1);
  });

  test("redo restores the same full editor transaction through the rendered DOM", async () => {
    renderOutliner();
    const user = await editFirstItemAndInsertSibling();

    // 2 entry → 2 회 undo + 2 회 redo
    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

    expect(treeTexts()).toContain(editedFirstItem);
    expect(treeTexts()).toContain("");
    expect(statusText()).toMatch(/focus =\s*\/children\/1/);
    expect(statusText()).toMatch(/selection =\s*1/);
    expect(selectedRows()).toHaveLength(1);
  });
});
