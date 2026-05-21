import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { ApiCollection } from "../src/index.js";

afterEach(() => {
  cleanup();
});

function renderCollection() {
  render(<ApiCollection />);
  expect(screen.getByRole("heading", { name: "API collection" })).toBeTruthy();
}

function rowByText(text: string): HTMLElement {
  const label = screen.getAllByText(text)[0];
  const row = label?.closest("[role='treeitem']");
  if (!(row instanceof HTMLElement)) throw new Error(`Missing row: ${text}`);
  return row;
}

function selectedRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll("[role='treeitem'][aria-selected='true']"));
}

describe("api collection selection and clipboard", () => {
  test("shift-select selects only visible item rows", async () => {
    renderCollection();
    const user = userEvent.setup();

    await user.click(rowByText("로그인"));
    await user.keyboard("{Shift>}");
    await user.click(rowByText("내 프로필"));
    await user.keyboard("{/Shift}");

    expect(selectedRows()).toHaveLength(3);
    expect(screen.getByRole("button", { name: "copy (3)" })).toBeTruthy();
  });

  test("copied multi-selection can be pasted repeatedly", async () => {
    renderCollection();
    const user = userEvent.setup();

    await user.click(rowByText("로그인"));
    await user.keyboard("{Shift>}");
    await user.click(rowByText("내 프로필"));
    await user.keyboard("{/Shift}");
    await user.click(screen.getByRole("button", { name: "copy (3)" }));

    await user.click(screen.getByRole("button", { name: "paste" }));
    await user.click(screen.getByRole("button", { name: "paste" }));

    await waitFor(() => expect(screen.getAllByText("로그인")).toHaveLength(3));
    expect(screen.getAllByText("토큰 갱신")).toHaveLength(3);
    expect(screen.getAllByText("내 프로필")).toHaveLength(3);
  });
});
