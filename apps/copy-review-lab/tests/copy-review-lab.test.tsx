import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

function renderLab() {
  render(<App />);
}

function documentText() {
  return screen.getByLabelText("copy document").textContent ?? "";
}

function matches() {
  return within(screen.getByLabelText("matches")).getAllByRole("listitem");
}

describe("copy review lab dogfood", () => {
  test("starts with scoped article matches from search-replace", () => {
    renderLab();

    expect(screen.getByRole("heading", { name: "Copy review lab" })).toBeTruthy();
    expect(screen.getByLabelText("match count").textContent).toBe("5");
    expect(matches()).toHaveLength(5);
    expect(documentText()).toContain("Draft launch notes");
  });

  test("replaces one current match through the extension target", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(within(matches()[0]!).getByRole("button", { name: "replace" }));

    expect(documentText()).toContain("final overview");
    expect(documentText()).toContain("This draft explains");
    expect(screen.getByRole("status").textContent).toBe("replace /articles/0/title");
  });

  test("replaces all matches inside the selected scope only", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "replace all" }));

    expect(documentText()).toContain("Draft launch notes");
    expect(documentText()).toContain("final overview");
    expect(documentText()).toContain("final API surface");
    expect(documentText()).toContain("final examples");
    expect(documentText()).toContain("draft archive marker");
    expect(screen.getByRole("status").textContent).toBe("replace all 5");
  });

  test("changes scope without app-owned traversal", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("scope"), "Archive");

    expect(screen.getByLabelText("match count").textContent).toBe("1");
    expect(matches()).toHaveLength(1);
    expect(within(matches()[0]!).getByText("/archive/note")).toBeTruthy();
  });

  test("empty search disables replace all through extension error state", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText("find text"));

    expect((screen.getByRole("button", { name: "replace all" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByLabelText("matches")).getByText("0")).toBeTruthy();
  });
});
