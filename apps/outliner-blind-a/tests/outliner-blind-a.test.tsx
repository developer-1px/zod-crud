import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/App";

afterEach(() => cleanup());

function values() {
  return screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value);
}

describe("outliner-blind-a", () => {
  it("edits text and keeps a selected node", () => {
    render(<App />);

    const first = screen.getByDisplayValue("Plan");
    fireEvent.change(first, { target: { value: "Now" } });

    expect(screen.getByDisplayValue("Now")).toBeTruthy();
    expect(screen.getByRole("treeitem", { selected: true })).toBeTruthy();
    expect(screen.getByText("/nodes/0")).toBeTruthy();
  });

  it("adds, indents, outdents, and reorders with keyboard commands", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByDisplayValue("Notes"));
    await user.keyboard("{Enter}");
    fireEvent.change(screen.getAllByRole("textbox")[4]!, { target: { value: "Later" } });

    expect(values()).toEqual(["Plan", "Scope", "Ship", "Notes", "Later"]);
    expect(screen.getByText("/nodes/2")).toBeTruthy();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByText("/nodes/2")).toBeTruthy();

    await user.keyboard("{Tab}");
    expect(screen.getByText("/nodes/1/children/0")).toBeTruthy();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByText("/nodes/2")).toBeTruthy();

    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(values()).toEqual(["Plan", "Scope", "Ship", "Later", "Notes"]);
  });

  it("duplicates the selected node", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByDisplayValue("Scope"));
    await user.keyboard("{Meta>}d{/Meta}");
    expect(values()).toEqual(["Plan", "Scope", "Scope", "Ship", "Notes"]);
  });

  it("supports internal clipboard paste", async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.keyDown(screen.getByDisplayValue("Plan"), { key: "c", metaKey: true });
    await user.click(screen.getByDisplayValue("Notes"));
    fireEvent.keyDown(screen.getByDisplayValue("Notes"), { key: "v", metaKey: true });

    expect(values()).toEqual(["Plan", "Scope", "Ship", "Notes", "Plan", "Scope", "Ship"]);
  });

  it("cuts and uses history undo redo", async () => {
    const user = userEvent.setup();
    render(<App />);

    const scope = screen.getByDisplayValue("Scope");
    await user.click(scope);
    await user.keyboard("{Meta>}x{/Meta}");

    expect(values()).toEqual(["Plan", "Ship", "Notes"]);

    await user.keyboard("{Meta>}z{/Meta}");
    expect(values()).toEqual(["Plan", "Scope", "Ship", "Notes"]);

    await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
    expect(values()).toEqual(["Plan", "Ship", "Notes"]);
  });

  it("exposes compact toolbar commands", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByDisplayValue("Notes"));
    await user.click(screen.getByRole("button", { name: "+" }));

    const tree = screen.getByRole("tree", { name: "Outline" });
    expect(within(tree).getAllByRole("textbox")).toHaveLength(5);
  });
});
