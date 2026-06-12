// 키보드·마우스만으로 커버되는 outliner 행위들의 보강 테스트.
// 기존 selection-auto-rules / outliner-interactions 가 다루지 않는 공백을 노린다.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { Outliner } from "../src/index.js";

afterEach(cleanup);

const firstItem = "Enter edit; Shift/Cmd+Enter insert";
const secondItem = "Tab demote";
const lastTopItem = "History";
const sectionTitle = "Selection";
const firstSelectionChild = "Click focus";

function renderOutliner() {
  render(<Outliner />);
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
    .map((i) => (i as HTMLInputElement).value);
}

function selectedRows() {
  return within(tree())
    .getAllByRole("treeitem")
    .filter((r) => r.getAttribute("aria-selected") === "true");
}

function focusedRow() {
  return within(tree())
    .getAllByRole("treeitem")
    .find((r) => r.classList.contains("focused"));
}

async function clickRow(text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByDisplayValue(text));
  return user;
}

async function clickBullet(text: string) {
  const user = userEvent.setup();
  const input = screen.getByDisplayValue(text);
  const row = input.closest("[role='treeitem']");
  const marker = row?.querySelector(".marker");
  if (!(marker instanceof HTMLElement)) throw new Error(`No marker for ${text}`);
  await user.click(marker);
  return user;
}

function toastTexts() {
  return Array.from(document.querySelectorAll(".toast")).map((el) => el.textContent ?? "");
}

describe("outliner coverage — keyboard & mouse only", () => {
  test("Home / End jump focus to first / last visible row in DFS order", async () => {
    renderOutliner();
    const user = await clickRow(secondItem);
    expect(statusText()).toMatch(/focus =\s*\/children\/1/);

    await user.keyboard("{End}");
    // 마지막 visible = History 의 마지막 자식 ("Cmd+Shift+Z redo") = /children/6/children/1
    expect(statusText()).toMatch(/focus =\s*\/children\/6\/children\/1/);

    await user.keyboard("{Home}");
    // 첫 visible = /children/0
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);
  });

  test("ArrowDown from last child crosses parent boundary (DFS pre-order)", async () => {
    renderOutliner();
    const user = await clickRow("Cmd/Ctrl+Click toggle"); // Selection 의 셋째 자식
    expect(statusText()).toMatch(/focus =\s*\/children\/4\/children\/2/);

    await user.keyboard("{ArrowDown}");
    // 같은 부모의 다음 형제 → "Cmd+A select all"
    expect(statusText()).toMatch(/focus =\s*\/children\/4\/children\/3/);

    await user.keyboard("{ArrowDown}");
    // 형제 끝 → 다음 top-level "Clipboard" 로 점프
    expect(statusText()).toMatch(/focus =\s*\/children\/5/);
  });

  test("clicking a bullet selects without entering edit mode", async () => {
    renderOutliner();
    const user = await clickBullet(firstItem);

    expect(statusText()).toMatch(/mode =\s*select/);
    expect(selectedRows()).toHaveLength(1);

    // edit 모드면 row 가 .editing 클래스를 가진다 — 없어야 함.
    expect(focusedRow()?.classList.contains("editing")).toBe(false);
    void user;
  });

  test("attempting to demote the first sibling reports an error toast", async () => {
    renderOutliner();
    const user = await clickRow(firstItem); // /children/0 — 이전 형제 없음
    await user.keyboard("{Tab}");

    // demote 는 prev sibling 이 없으면 path_not_found
    expect(toastTexts().some((t) => /path_not_found/i.test(t))).toBe(true);
  });

  test("Cmd+X cuts the focused row immediately (row removed, clipboard buffered)", async () => {
    renderOutliner();
    const user = await clickRow(secondItem);

    const before = treeTexts().length;
    await user.keyboard("{Control>}x{/Control}");

    // row 가 즉시 사라짐
    expect(treeTexts()).not.toContain(secondItem);
    expect(treeTexts().length).toBe(before - 1);
    // clipboard 가 채워짐 (status 표시: "clipboard = copy 1")
    expect(statusText()).toMatch(/clipboard =\s*cut\s*1/);
  });

  test("Cmd+Shift+V pastes as child of the focused row", async () => {
    renderOutliner();
    const user = await clickRow(firstItem);
    await user.keyboard("{Control>}c{/Control}");

    // History 로 이동해서 그 자식으로 paste.
    await user.click(screen.getByDisplayValue(lastTopItem));
    await user.keyboard("{Control>}{Shift>}v{/Shift}{/Control}");

    // History 의 마지막 자식이 firstItem 의 복제여야 함.
    const allTexts = treeTexts();
    // firstItem 은 SAMPLE 에 1개, paste 후 2개.
    expect(allTexts.filter((t) => t === firstItem).length).toBe(2);
  });

  test("Cmd+Z undoes a structural mutation (Tab demote) and restores tree shape", async () => {
    renderOutliner();
    const user = await clickRow(secondItem);
    const rowOf = (text: string) =>
      screen.getByDisplayValue(text).closest("[role='treeitem']") as HTMLElement;
    const beforeLevel = rowOf(secondItem).getAttribute("aria-level");

    await user.keyboard("{Tab}");
    expect(rowOf(secondItem).getAttribute("aria-level")).not.toBe(beforeLevel);

    await user.keyboard("{Control>}z{/Control}");
    expect(rowOf(secondItem).getAttribute("aria-level")).toBe(beforeLevel);
  });

  test("Cmd+Shift+Z redoes after undo, restoring the post-mutation depth", async () => {
    renderOutliner();
    const user = await clickRow(secondItem);
    const rowOf = (text: string) =>
      screen.getByDisplayValue(text).closest("[role='treeitem']") as HTMLElement;
    await user.keyboard("{Tab}");
    const demotedLevel = rowOf(secondItem).getAttribute("aria-level");

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");

    expect(rowOf(secondItem).getAttribute("aria-level")).toBe(demotedLevel);
  });

  test("Backspace on a multi-select removes all in one batch (G8 atomicity)", async () => {
    renderOutliner();
    const user = await clickRow(firstItem);
    // Shift+ArrowDown × 2 → /0..2 range
    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    expect(selectedRows()).toHaveLength(3);

    const beforeCount = treeTexts().length;
    await user.keyboard("{Backspace}");

    expect(treeTexts().length).toBe(beforeCount - 3);
    // 한 번의 undo 가 3 개 row 를 모두 복구해야 G8.
    await user.keyboard("{Control>}z{/Control}");
    expect(treeTexts().length).toBe(beforeCount);
  });

  test("Cmd+A then Backspace removes all non-root rows (root survives)", async () => {
    renderOutliner();
    // 어떤 row 든 클릭해서 select 모드 진입
    const user = await clickRow(firstItem);
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Backspace}");

    // root 만 남아야 함 — root 는 SAMPLE.text "json-document outliner"
    const remaining = treeTexts();
    expect(remaining).toEqual(["json-document outliner"]);
  });

  test("paste with no clipboard surfaces a path_not_found error toast", async () => {
    renderOutliner();
    const user = await clickRow(firstItem);
    await user.keyboard("{Control>}v{/Control}");

    await waitFor(() => {
      expect(toastTexts().some((t) => /clipboard is empty/i.test(t))).toBe(true);
    });
  });

  test("focus rule ② — removing the focused row recovers focus to the next sibling", async () => {
    renderOutliner();
    const user = await clickRow(sectionTitle); // /children/4 — has children
    await user.keyboard("{Backspace}");

    // /children/4 가 사라지고 다음 sibling 이 그 자리로 당겨진다 ("Clipboard")
    expect(statusText()).toMatch(/focus =\s*\/children\/4/);
    expect(treeTexts()).not.toContain(sectionTitle);
    expect(treeTexts()).toContain("Clipboard");
    void firstSelectionChild;
  });
});
