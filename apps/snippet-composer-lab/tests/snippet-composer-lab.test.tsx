import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

function renderLab() {
  render(<App />);
}

function documentPanel() {
  return screen.getByLabelText("page blocks");
}

describe("snippet composer lab dogfood", () => {
  test("shows snippet insert capability before executing the command", () => {
    renderLab();

    expect(screen.getByRole("heading", { name: "Snippet composer lab" })).toBeTruthy();
    expect(screen.getByLabelText("canInsert").textContent).toContain("schema_violation");
    expect((screen.getByRole("button", { name: "insert" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(documentPanel()).getByText("intro")).toBeTruthy();
    expect(within(documentPanel()).getByText("note")).toBeTruthy();
  });

  test("inserts a duplicate-id snippet after rekey is enabled", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("rekey ids"));
    await user.click(screen.getByRole("button", { name: "insert" }));

    expect(screen.getByLabelText("canInsert").textContent).toBe("ok");
    expect(within(documentPanel()).getByText("intro-copy")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("insert text-block");
  });

  test("uses the target argument to insert after the selected block", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("select block 1"));
    await user.selectOptions(screen.getByLabelText("target mode"), "after-selected");
    await user.click(screen.getByLabelText("select cta-link"));
    await user.click(screen.getByRole("button", { name: "insert" }));

    const blockLabels = within(documentPanel()).getAllByRole("button").map((button) => button.textContent);
    expect(blockLabels).toEqual([
      "introtextDraft the opening copy.",
      "notecalloutinfo: Keep the schema valid.",
      "ctactaRead docs - https://example.com/docs",
    ]);
    expect(screen.getByLabelText("target value").textContent).toBe("after /blocks/1");
  });

  test("surfaces schema rejection for snippets that do not fit the document", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("select broken-link"));

    expect(screen.getByLabelText("canInsert").textContent).toContain("schema_violation");
    expect((screen.getByRole("button", { name: "insert" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(documentPanel()).queryByText("broken")).toBeNull();
  });
});
