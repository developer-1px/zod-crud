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
      "root exports",
      "react",
      "document",
      "read",
      "can",
      "selection",
      "clipboard",
      "history",
      "schema",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "zod-crud API" })).toBeNull();
  });

  test("keeps the public document controls discoverable", () => {
    render(<InterfaceWorkbench />);

    const expectedControls = {
      "root exports": ["createJSONDocument", "applyOperation", "applyPatch", "applyPatchToTrustedState", "pointer helpers", "trackPointer"],
      react: ["useJSONDocument"],
      document: [
        "doc.value",
        "doc.lastPatch",
        "doc.patch add",
        "canPatch add",
        "doc.patch replace",
        "canPatch replace",
        "doc.patch remove",
        "canPatch remove",
        "doc.patch batch",
        "doc.patch invalid",
        "doc.patch move",
        "canMove",
        "doc.patch replace selected",
        "canReplace",
        "doc.patch remove selected",
        "canRemove",
        "doc.commit",
        "doc.duplicate",
        "canDuplicate",
        "doc.load",
        "doc.reset",
        "doc.subscribe",
      ],
      read: ["doc.at", "doc.exists", "doc.entries", "doc.query", "canFind"],
      can: [
        "doc.canPatch",
        "doc.canFind",
        "doc.canReplace ok",
        "doc.canReplace bad",
        "doc.canRemove",
        "doc.canMove",
        "doc.canDuplicate",
        "doc.canCopy",
        "doc.canCut",
        "doc.canPaste",
        "doc.canPastePayload after",
        "doc.canPastePayload insert",
        "doc.canUndo/Redo",
      ],
      selection: [
        "selection.collapse",
        "selection.togglePointer",
        "selection.selectRanges",
        "selection.moveCursor",
        "selection.extendCursor",
        "selection.selectScope",
        "selection.textPoint",
        "selection.textPatch",
        "selection.empty",
      ],
      clipboard: [
        "clipboard.copy",
        "canCopy",
        "clipboard.cut",
        "canCut",
        "clipboard.paste after",
        "canPaste after",
        "clipboard.paste insert",
        "canPaste insert",
        "clipboard.pastePayload after",
        "canPastePayload after",
        "clipboard.pastePayload insert",
        "canPastePayload insert",
        "clipboard.write",
        "clipboard.read",
        "clipboard.clear",
      ],
      history: ["history.undo", "canUndo", "history.redo", "canRedo", "history.transaction", "history.mergeLast"],
      schema: ["schema.kind", "schema.at", "schema.describe", "schema.accepts valid", "schema.accepts invalid"],
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

    const patchReplace = within(group("document")).getByRole("button", { name: "doc.patch replace" });
    expect((patchReplace as HTMLButtonElement).disabled).toBe(true);
    expect(patchReplace.title).toContain("can:");
    expect(within(patchReplace).getByText("can")).toBeTruthy();

    const canPatch = within(group("document")).getByRole("button", { name: "canPatch replace" });
    expect((canPatch as HTMLButtonElement).disabled).toBe(false);
    await user.click(canPatch);
    expect(screen.getAllByText(/doc\.canPatch/).length).toBeGreaterThan(0);
  });

  test("keeps duplicate focused on the newly duplicated card", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();
    const target = screen.getByLabelText("value target") as HTMLSelectElement;
    const duplicate = within(group("document")).getByRole("button", { name: "doc.duplicate" });

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

    await user.click(within(group("document")).getByRole("button", { name: "doc.patch add" }));
    expect(screen.getByText("Inserted card")).toBeTruthy();

    await user.click(within(group("selection")).getByRole("button", { name: "selection.selectRanges" }));
    expect(screen.getByText("selected 3")).toBeTruthy();

    await user.click(within(group("clipboard")).getByRole("button", { name: "clipboard.copy" }));
    expect(screen.getByText("clipboard set")).toBeTruthy();

    await user.click(within(group("clipboard")).getByRole("button", { name: "clipboard.paste after" }));
    expect(screen.getAllByText("Patch API").length).toBeGreaterThan(1);

    await user.click(within(group("can")).getByRole("button", { name: "doc.canPatch" }));
    expect(screen.getAllByText(/doc\.canPatch/).length).toBeGreaterThan(0);

    await user.click(within(group("can")).getByRole("button", { name: "doc.canFind" }));
    expect(screen.getAllByText(/doc\.canFind/).length).toBeGreaterThan(0);

    await user.click(within(group("can")).getByRole("button", { name: "doc.canMove" }));
    expect(screen.getAllByText(/doc\.canMove/).length).toBeGreaterThan(0);

    await user.click(within(group("can")).getByRole("button", { name: "doc.canPaste" }));
    expect(screen.getAllByText(/doc\.canPaste/).length).toBeGreaterThan(0);

    await user.click(within(group("schema")).getByRole("button", { name: "schema.accepts invalid" }));
    expect(screen.getAllByText(/doc\.schema\.accepts/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/schema_violation/).length).toBeGreaterThan(0);

    await user.click(within(group("root exports")).getByRole("button", { name: "applyPatch" }));
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(0);
  });
});
