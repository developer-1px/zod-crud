import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { InterfaceWorkbench } from "../src/playgrounds/InterfaceWorkbench.playground.js";

afterEach(() => {
  cleanup();
});

function group(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const element = heading.closest("div");
  if (!(element instanceof HTMLElement)) throw new Error(`Missing group: ${title}`);
  return element;
}

describe("InterfaceWorkbench", () => {
  test("exposes each JSONDocument facade group", () => {
    render(<InterfaceWorkbench />);

    expect(screen.getByText("Interface bench")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Todo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Doing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Done" })).toBeTruthy();
    expect(screen.getByLabelText("value target")).toBeTruthy();
    expect(screen.getByLabelText("insert target")).toBeTruthy();
    expect(screen.getByLabelText("text payload")).toBeTruthy();
    expect(screen.getByLabelText("points")).toBeTruthy();
    expect(screen.getByLabelText("bad points")).toBeTruthy();
    expect(screen.getByLabelText("payload")).toBeTruthy();
    for (const title of [
      "doc.patch",
      "document actions",
      "doc.selection",
      "doc.clipboard",
      "doc.history",
      "doc.query",
      "doc.can*",
      "doc.schema",
      "pure exports",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "zod-crud API" })).toBeNull();
  });

  test("keeps the public document controls discoverable", () => {
    render(<InterfaceWorkbench />);

    const expectedControls = {
      "doc.patch": ["add", "replace", "remove", "batch", "invalid", "load", "reset"],
      "document actions": ["duplicate", "move", "replace", "paste payload after", "remove", "select query", "replaceText"],
      "doc.selection": ["collapse", "toggle target", "select todo", "next", "extend", "scope", "text point", "empty"],
      "doc.clipboard": ["copy", "cut", "paste after", "paste insert", "payload insert", "copy to insert", "write", "read", "clear"],
      "doc.history": ["undo", "redo", "transaction", "mergeLast", "commit"],
      "doc.query": ["at", "exists", "entries", "query"],
      "doc.can*": ["patch", "find", "replace ok", "replace bad", "remove", "move", "duplicate", "copy", "cut", "paste buffer", "paste after", "paste insert", "stacks"],
      "doc.schema": ["kind", "at", "describe insert", "accepts", "rejects"],
      "pure exports": ["inspect"],
    } as const;

    for (const [groupName, controls] of Object.entries(expectedControls)) {
      const controlsGroup = within(group(groupName));
      for (const control of controls) {
        expect(controlsGroup.getByRole("button", { name: control })).toBeTruthy();
      }
    }
  });

  test("marks can-disabled actions without hiding can checks", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("value target"), "/title");

    const patchReplace = within(group("doc.patch")).getByRole("button", { name: "replace" });
    expect((patchReplace as HTMLButtonElement).disabled).toBe(true);
    expect(patchReplace.title).toContain("can:");
    expect(within(patchReplace).getByText("can")).toBeTruthy();

    const canReplace = within(group("doc.can*")).getByRole("button", { name: "replace ok" });
    expect((canReplace as HTMLButtonElement).disabled).toBe(false);
    await user.click(canReplace);
    expect(screen.getAllByText(/doc\.canReplace/).length).toBeGreaterThan(0);
  });

  test("keeps duplicate focused on the newly duplicated card", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();
    const target = screen.getByLabelText("value target") as HTMLSelectElement;
    const duplicate = within(group("document actions")).getByRole("button", { name: "duplicate" });

    await user.click(duplicate);
    expect(target.value).toBe("/lists/0/cards/1");

    await user.click(duplicate);
    expect(target.value).toBe("/lists/0/cards/2");
    const selectedCards = screen.getAllByRole("button")
      .filter((button) => button.getAttribute("aria-selected") === "true");
    expect(selectedCards).toHaveLength(1);
    expect(selectedCards[0]?.textContent).toContain("/lists/0/cards/2");
  });

  test("runs representative ops, selection, clipboard, and schema actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.click(within(group("doc.patch")).getByRole("button", { name: "add" }));
    expect(screen.getByText("Inserted card")).toBeTruthy();

    await user.click(within(group("doc.selection")).getByRole("button", { name: "select todo" }));
    expect(screen.getByText("selected 3")).toBeTruthy();

    await user.click(within(group("doc.clipboard")).getByRole("button", { name: "copy" }));
    expect(screen.getByText("clipboard set")).toBeTruthy();

    await user.click(within(group("doc.clipboard")).getByRole("button", { name: "paste after" }));
    expect(screen.getAllByText("Patch API").length).toBeGreaterThan(1);

    await user.click(within(group("doc.clipboard")).getByRole("button", { name: "copy to insert" }));
    expect(screen.getAllByText(/doc\.clipboard\.copy\(source\); doc\.clipboard\.paste/).length).toBeGreaterThan(0);

    await user.click(within(group("doc.can*")).getByRole("button", { name: "patch" }));
    expect(screen.getAllByText(/doc\.canPatch/).length).toBeGreaterThan(0);

    await user.click(within(group("doc.can*")).getByRole("button", { name: "find" }));
    expect(screen.getAllByText(/doc\.canFind/).length).toBeGreaterThan(0);

    await user.click(within(group("doc.can*")).getByRole("button", { name: "move" }));
    expect(screen.getAllByText(/doc\.canMove/).length).toBeGreaterThan(0);

    await user.click(within(group("doc.can*")).getByRole("button", { name: "paste buffer" }));
    expect(screen.getAllByText(/doc\.canPaste/).length).toBeGreaterThan(0);

    await user.click(within(group("doc.schema")).getByRole("button", { name: "rejects" }));
    expect(screen.getAllByText(/doc\.schema\.accepts/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/schema_violation/).length).toBeGreaterThan(0);

    await user.click(within(group("pure exports")).getByRole("button", { name: "inspect" }));
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(0);
  });
});
