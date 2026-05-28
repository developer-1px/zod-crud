import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { InterfaceWorkbench } from "../src/playgrounds/InterfaceWorkbench.playground.js";

afterEach(() => {
  cleanup();
});

const featureStages = [
  "Board setup",
  "Card intake",
  "Card edit",
  "Flow across columns",
  "Selection and bulk work",
  "Reuse via clipboard",
  "Find and filter",
  "Recovery and history",
  "Integration and helpers",
] as const;

function apiGroup(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const element = heading.closest("[data-api-group]");
  if (!(element instanceof HTMLElement)) throw new Error(`Missing API group: ${title}`);
  return element;
}

function flowRail(): HTMLElement {
  const element = document.querySelector("[data-flow-rail]");
  if (!(element instanceof HTMLElement)) throw new Error("Missing flow rail");
  return element;
}

function stageDetail(): HTMLElement {
  const element = document.querySelector("[data-stage-detail]");
  if (!(element instanceof HTMLElement)) throw new Error("Missing stage detail");
  return element;
}

function commandRow(title: string): HTMLElement {
  const titleNode = within(stageDetail()).getByRole("heading", { name: title });
  const element = titleNode.closest("[data-command-row]");
  if (!(element instanceof HTMLElement)) throw new Error(`Missing command row: ${title}`);
  return element;
}

function stageLabel(label: string): HTMLElement {
  return within(stageDetail()).getByLabelText(label);
}

function expectStageText(text: string): void {
  expect(stageDetail().textContent).toContain(text);
}

async function selectStage(
  user: ReturnType<typeof userEvent.setup>,
  title: (typeof featureStages)[number],
): Promise<void> {
  void user;
  fireEvent.click(within(flowRail()).getByRole("button", { name: title }));
  expect(within(stageDetail()).getByRole("heading", { name: title })).toBeTruthy();
}

async function openApiCoverage(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const summary = screen.getByText("API coverage index");
  if (summary.closest("details")?.hasAttribute("open") !== true) await user.click(summary);
}

function expectButtons(groupName: string, controls: readonly string[]): void {
  const text = apiGroup(groupName).textContent ?? "";
  for (const control of controls) {
    expect(text).toContain(control);
  }
}

describe("InterfaceWorkbench", () => {
  test("uses Kanban feature flow as the primary API lab surface", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    expect(screen.getByText("Interface bench")).toBeTruthy();
    expect(flowRail()).toBeTruthy();
    expect(document.querySelector("[data-command-list]")).toBeNull();
    for (const stage of featureStages) {
      expect(within(flowRail()).getByRole("button", { name: stage })).toBeTruthy();
    }

    expect(within(stageDetail()).getByRole("heading", { name: "Board setup" })).toBeTruthy();
    expectStageText("useJSONDocument");
    expect(commandRow("Create board")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Todo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Doing" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Done" })).toBeTruthy();

    await selectStage(user, "Card intake");
    expectStageText("patch(add)");
    expect(commandRow("Add card to column")).toBeTruthy();
    expect(stageLabel("add target")).toBeTruthy();
    expect(stageLabel("add payload")).toBeTruthy();

    await selectStage(user, "Card edit");
    expectStageText("canReplace");
    expect(commandRow("Rename card")).toBeTruthy();
    expect(stageLabel("rename target")).toBeTruthy();
    expect(stageLabel("rename title")).toBeTruthy();

    await selectStage(user, "Flow across columns");
    expectStageText("canMove");
    expect(commandRow("Move card")).toBeTruthy();
    expect(commandRow("Duplicate card")).toBeTruthy();

    await selectStage(user, "Selection and bulk work");
    expectStageText("selection.*");
    expect(commandRow("Build selection")).toBeTruthy();
    expect(commandRow("Remove selected")).toBeTruthy();

    await selectStage(user, "Reuse via clipboard");
    expectStageText("canPastePayload");
    expect(commandRow("Copy selected")).toBeTruthy();
    expect(commandRow("Paste selected into column")).toBeTruthy();

    await selectStage(user, "Find and filter");
    expectStageText("selection.selectRanges");
    expect(commandRow("Search cards")).toBeTruthy();
    expect(commandRow("Select search results")).toBeTruthy();
    expect(stageLabel("search query")).toBeTruthy();

    await selectStage(user, "Recovery and history");
    expectStageText("canUndo");
    expect(commandRow("Undo")).toBeTruthy();
    expect(commandRow("Redo")).toBeTruthy();

    await selectStage(user, "Integration and helpers");
    expectStageText("applyPatchToTrustedState");
    expect(commandRow("Apply operation")).toBeTruthy();
    expect(commandRow("Pointer helpers")).toBeTruthy();

    expect(screen.getByText("API coverage index")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "zod-crud API" })).toBeNull();
  }, 10_000);

  test("exposes every public runtime API surface", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();
    await openApiCoverage(user);

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

  test("keeps public type exports visible", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();
    await openApiCoverage(user);
    const typeGroup = within(apiGroup("type API"));

    for (const typeName of [
      "JSONDocument",
      "JSONPatchOperation",
      "Pointer",
      "ClipboardState",
      "SchemaState",
      "SelectionState",
      "JSONDocumentPasteTarget",
    ]) {
      expect(typeGroup.getByText(typeName)).toBeTruthy();
    }
  });

  test("keeps feature-level can checks paired with actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await selectStage(user, "Card edit");
    await user.selectOptions(stageLabel("rename target"), "/title");

    const rename = within(commandRow("Rename card"));
    const action = rename.getByRole("button", { name: "Rename" });
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(action.title).toContain("can:");
    expect(within(commandRow("Rename card")).getByText("can path_not_found")).toBeTruthy();
    expect(rename.queryByRole("button", { name: "canPatch" })).toBeNull();

    await selectStage(user, "Selection and bulk work");
    await user.click(within(commandRow("Build selection")).getByRole("button", { name: "select 0" }));
    await selectStage(user, "Card edit");
    const emptySelectionRename = within(commandRow("Rename card")).getByRole("button", { name: "Rename" });
    expect((emptySelectionRename as HTMLButtonElement).disabled).toBe(true);
    expect(emptySelectionRename.title).toContain("select_one_card");
    expect(within(commandRow("Rename card")).getByText("state select_one_card")).toBeTruthy();
  });

  test("keeps duplicate focused on the newly duplicated card", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();
    await selectStage(user, "Flow across columns");
    const target = stageLabel("duplicate source") as HTMLSelectElement;
    const duplicate = within(commandRow("Duplicate card")).getByRole("button", { name: "Duplicate" });

    await user.click(duplicate);
    expect(target.value).toBe("/lists/0/cards/1");

    await user.click(duplicate);
    expect(target.value).toBe("/lists/0/cards/2");
    const selectedCards = screen.getAllByRole("button")
      .filter((button) => button.getAttribute("aria-selected") === "true");
    expect(selectedCards).toHaveLength(1);
    expect(selectedCards[0]?.textContent).toContain("/lists/0/cards/2");
  });

  test("connects basic key bindings to command actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await selectStage(user, "Flow across columns");
    expect(within(commandRow("Duplicate card")).getByText("D")).toBeTruthy();
    const target = stageLabel("duplicate source") as HTMLSelectElement;
    fireEvent.keyDown(window, { key: "d" });
    expect(target.value).toBe("/lists/0/cards/1");

    await selectStage(user, "Card intake");
    expect(within(commandRow("Add card to column")).getByText("N")).toBeTruthy();
    fireEvent.keyDown(window, { key: "n" });
    expect(screen.getByText("Inserted card")).toBeTruthy();

    await selectStage(user, "Recovery and history");
    expect(within(commandRow("Undo")).getByText("Cmd/Ctrl Z")).toBeTruthy();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(screen.queryByText("Inserted card")).toBeNull();

    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });
    expect(screen.getByText("Inserted card")).toBeTruthy();

    await selectStage(user, "Card edit");
    fireEvent.keyDown(stageLabel("rename title"), { key: "d" });
    await selectStage(user, "Flow across columns");
    expect((stageLabel("duplicate source") as HTMLSelectElement).value).toBe("/lists/0/cards/1");
  });

  test("runs representative Kanban feature flows", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await selectStage(user, "Card intake");
    await user.click(within(commandRow("Add card to column")).getByRole("button", { name: "Add" }));
    expect(screen.getByText("Inserted card")).toBeTruthy();

    await user.click(within(commandRow("Validate invalid draft")).getByRole("button", { name: "Validate invalid" }));
    expect(screen.getAllByText(/doc\.schema\.accepts/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/schema_violation/).length).toBeGreaterThan(0);

    await selectStage(user, "Find and filter");
    await user.click(within(commandRow("Select search results")).getByRole("button", { name: "Select" }));
    expect(screen.getAllByText("selected 3").length).toBeGreaterThan(0);

    await selectStage(user, "Reuse via clipboard");
    await user.click(within(commandRow("Copy selected")).getByRole("button", { name: "Copy" }));
    expect(screen.getAllByText("clipboard set").length).toBeGreaterThan(0);

    await user.click(within(commandRow("Paste selected into column")).getByRole("button", { name: "Paste" }));
    expect(screen.getAllByText("Patch API").length).toBeGreaterThan(1);

    await selectStage(user, "Integration and helpers");
    await user.click(within(commandRow("Apply external patch")).getByRole("button", { name: "Apply" }));
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(0);
  });
});
