import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { InterfaceWorkbench } from "../src/playgrounds/InterfaceWorkbench.playground.js";

afterEach(() => {
  cleanup();
});

function group(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const element = heading.closest("[data-api-group]");
  if (!(element instanceof HTMLElement)) throw new Error(`Missing group: ${title}`);
  return element;
}

function expectButtons(groupName: string, controls: readonly string[]): void {
  const text = group(groupName).textContent ?? "";
  for (const control of controls) {
    expect(text).toContain(control);
  }
}

describe("InterfaceWorkbench", () => {
  test("uses Kanban features as the primary API lab surface", () => {
    render(<InterfaceWorkbench />);

    expect(screen.getByText("Interface bench")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Todo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Doing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Done" })).toBeTruthy();
    expect(screen.getByLabelText("value target")).toBeTruthy();
    expect(screen.getByLabelText("insert target")).toBeTruthy();
    expect(screen.getByLabelText("payload")).toBeTruthy();

    for (const title of [
      "Create board",
      "Add card",
      "Edit card",
      "Move card",
      "Duplicate card",
      "Find and select",
      "Copy and paste",
      "Bulk cards",
      "Undo and redo",
      "Read schema",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "zod-crud API" })).toBeNull();
  });

  test("exposes every public runtime API surface", () => {
    render(<InterfaceWorkbench />);

    expectButtons("root API", [
      "JSONCrudError",
      "PointerSyntaxError",
      "createJSONDocument",
      "applyOperation",
      "applyPatch",
      "applyPatchToTrustedState",
      "parsePointer",
      "tryParsePointer",
      "buildPointer",
      "escapeSegment",
      "unescapeSegment",
      "parentPointer",
      "lastSegment",
      "lastSegmentIndex",
      "appendSegment",
      "withLastSegment",
      "trackPointer",
    ]);
    expectButtons("react API", ["useJSONDocument"]);
    expectButtons("document API", [
      "doc.value",
      "doc.lastPatch",
      "doc.selection",
      "doc.history",
      "doc.clipboard",
      "doc.schema",
      "doc.patch",
      "doc.commit",
      "doc.duplicate",
      "doc.load",
      "doc.reset",
      "doc.subscribe",
      "doc.at",
      "doc.exists",
      "doc.query",
      "doc.entries",
      "doc.canPatch",
      "doc.canFind",
      "doc.canReplace",
      "doc.canRemove",
      "doc.canMove",
      "doc.canDuplicate",
      "doc.canCopy",
      "doc.canCut",
      "doc.canPaste",
      "doc.canPastePayload",
      "doc.canUndo",
      "doc.canRedo",
    ]);
    expectButtons("selection API", [
      "selection properties",
      "selection.collapse",
      "selection.setBaseAndExtent",
      "selection.extend",
      "selection.addRange",
      "selection.removeRange",
      "selection.toggleRange",
      "selection.togglePointer",
      "selection.moveCursor",
      "selection.extendCursor",
      "selection.resolveCursor",
      "selection.orderPrimaryRange",
      "selection.orderRanges",
      "selection.spansForPointer",
      "selection.textEdits",
      "selection.textPatch",
      "selection.deleteText",
      "selection.selectScope",
      "selection.resolveScope",
      "selection.selectRanges",
      "selection.setContext",
      "selection.clearContext",
      "selection.empty",
      "selection.isSelected",
      "selection.snapshot",
      "selection.toJSON",
      "selection.restore",
      "selection.subscribe",
    ]);
    expectButtons("clipboard API", [
      "clipboard.hasData",
      "clipboard.source",
      "clipboard.sources",
      "clipboard.read",
      "clipboard.write",
      "clipboard.clear",
      "clipboard.copy",
      "clipboard.cut",
      "clipboard.paste",
      "clipboard.pastePayload",
      "clipboard.paste after",
      "clipboard.pastePayload after",
    ]);
    expectButtons("history API", [
      "history.canUndo",
      "history.canRedo",
      "history.undoDepth",
      "history.redoDepth",
      "history.undo",
      "history.redo",
      "history.mergeLast",
      "history.transaction",
    ]);
    expectButtons("schema API", ["schema.at", "schema.kind", "schema.accepts", "schema.accepts invalid", "schema.describe"]);
  });

  test("keeps public type exports visible", () => {
    render(<InterfaceWorkbench />);
    const typeGroup = within(group("type API"));

    for (const typeName of [
      "JSONDocument",
      "JSONPatchOperation",
      "Pointer",
      "ClipboardState",
      "SchemaState",
      "SelectionState",
      "PasteTarget",
    ]) {
      expect(typeGroup.getByText(typeName)).toBeTruthy();
    }
  });

  test("keeps feature-level can checks paired with actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("value target"), "/title");

    const edit = within(group("Edit card"));
    const patch = edit.getByRole("button", { name: "doc.patch" });
    expect((patch as HTMLButtonElement).disabled).toBe(true);
    expect(patch.title).toContain("can:");
    expect(within(patch).getByText("can")).toBeTruthy();

    const canPatch = edit.getByRole("button", { name: "doc.canPatch" });
    expect((canPatch as HTMLButtonElement).disabled).toBe(false);
    await user.click(canPatch);
    expect(screen.getAllByText(/doc\.canPatch/).length).toBeGreaterThan(0);
  });

  test("keeps duplicate focused on the newly duplicated card", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();
    const target = screen.getByLabelText("value target") as HTMLSelectElement;
    const duplicate = within(group("Duplicate card")).getByRole("button", { name: "doc.duplicate" });

    await user.click(duplicate);
    expect(target.value).toBe("/lists/0/cards/1");

    await user.click(duplicate);
    expect(target.value).toBe("/lists/0/cards/2");
    const selectedCards = screen.getAllByRole("button")
      .filter((button) => button.getAttribute("aria-selected") === "true");
    expect(selectedCards).toHaveLength(1);
    expect(selectedCards[0]?.textContent).toContain("/lists/0/cards/2");
  });

  test("runs representative Kanban feature flows", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.click(within(group("Add card")).getByRole("button", { name: "doc.patch" }));
    expect(screen.getByText("Inserted card")).toBeTruthy();

    await user.click(within(group("Find and select")).getByRole("button", { name: "selection.selectRanges" }));
    expect(screen.getAllByText("selected 3").length).toBeGreaterThan(0);

    await user.click(within(group("Copy and paste")).getByRole("button", { name: "clipboard.copy" }));
    expect(screen.getAllByText("clipboard set").length).toBeGreaterThan(0);

    await user.click(within(group("Copy and paste")).getByRole("button", { name: "clipboard.paste after" }));
    expect(screen.getAllByText("Patch API").length).toBeGreaterThan(1);

    await user.click(within(group("document API")).getByRole("button", { name: "doc.canMove" }));
    expect(screen.getAllByText(/doc\.canMove/).length).toBeGreaterThan(0);

    await user.click(within(group("schema API")).getByRole("button", { name: "schema.accepts invalid" }));
    expect(screen.getAllByText(/doc\.schema\.accepts/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/schema_violation/).length).toBeGreaterThan(0);

    await user.click(within(group("root API")).getByRole("button", { name: "applyPatch" }));
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(0);
  });
});
