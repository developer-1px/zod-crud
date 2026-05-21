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
    for (const title of [
      "doc.ops",
      "doc.commands",
      "doc.selection",
      "doc.clipboard",
      "history / commit",
      "read / query",
      "check / can",
      "doc.schema",
      "pure exports",
      "zod-crud API",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getAllByText(/createJSONDocument/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SelectionState/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/useJSONDocument/).length).toBeGreaterThan(0);
  });

  test("runs representative ops, selection, clipboard, and schema actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.click(within(group("doc.ops")).getByRole("button", { name: "add" }));
    expect(screen.getByText("Card c4")).toBeTruthy();

    await user.click(within(group("doc.selection")).getByRole("button", { name: "todo" }));
    expect(screen.getByText("selected: 3")).toBeTruthy();

    await user.click(within(group("doc.clipboard")).getByRole("button", { name: "copy" }));
    expect(screen.getByText("clipboard: set")).toBeTruthy();

    await user.click(within(group("doc.clipboard")).getByRole("button", { name: "paste" }));
    expect(screen.getAllByText("Patch API").length).toBeGreaterThan(1);

    await user.click(within(group("doc.schema")).getByRole("button", { name: "rejects" }));
    expect(screen.getByRole("heading", { name: "schema.rejects" })).toBeTruthy();
    expect(screen.getByText(/schema_violation/)).toBeTruthy();

    await user.click(within(group("pure exports")).getByRole("button", { name: "inspect" }));
    expect(screen.getAllByRole("heading", { name: "pure exports" }).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(0);
  });
});
