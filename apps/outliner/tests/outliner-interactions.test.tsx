import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { defaultDocumentPersistenceCodec } from "@zod-crud/persist-web";
import { Outliner } from "../src/index.js";
import { findCommand } from "../src/keymap.js";

const firstItem = "Enter edit; Shift/Cmd+Enter insert";
const secondItem = "Tab demote";
const thirdItem = "Shift+Tab promote";
const selectionItem = "Selection";
const firstSelectionChild = "Click focus";
const editedFirstItem = "Edited first item";
const draftKey = "zod-crud.outliner.draft";

afterEach(() => {
  cleanup();
  globalThis.localStorage?.removeItem(draftKey);
});

function renderOutliner() {
  render(<Outliner />);
  expect(screen.getByRole("tree", { name: "outline" })).toBeTruthy();
}

function statusText() {
  return document.querySelector(".status")?.textContent ?? "";
}

function toastTexts() {
  return Array.from(document.querySelectorAll(".toast")).map((el) => el.textContent ?? "");
}

function tree() {
  return screen.getByRole("tree");
}

function treeTexts() {
  return within(tree())
    .getAllByRole("textbox")
    .map((input) => (input as HTMLInputElement).value);
}

function treeItems() {
  return within(tree()).getAllByRole("treeitem");
}

function selectedRows() {
  return treeItems().filter((row) => row.getAttribute("aria-selected") === "true");
}

function rowForText(text: string) {
  const input = screen.getByDisplayValue(text);
  const row = input.closest("[role='treeitem']");
  if (!row) throw new Error(`No tree row for ${text}`);
  return row as HTMLElement;
}

function markerForText(text: string) {
  const marker = rowForText(text).querySelector(".marker");
  if (!(marker instanceof HTMLElement)) throw new Error(`No marker for ${text}`);
  return marker;
}

function installSystemClipboard(readText: () => string) {
  const hadSecureContext = "isSecureContext" in globalThis;
  const originalSecureContext = globalThis.isSecureContext;
  const originalClipboard = globalThis.navigator.clipboard;
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: {
      readText,
      writeText: () => undefined,
    },
  });

  return () => {
    if (hadSecureContext) {
      Object.defineProperty(globalThis, "isSecureContext", {
        configurable: true,
        value: originalSecureContext,
      });
    } else {
      delete (globalThis as { isSecureContext?: boolean }).isSecureContext;
    }
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  };
}

function installLocalStorageHost(host: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: host,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, "localStorage", descriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  };
}

// click 정책 (변경됨): text 클릭은 select 모드. edit 진입은 Enter 가 필요.
async function clickText(text: string) {
  const user = userEvent.setup();
  const input = screen.getByDisplayValue(text);
  await user.click(input);
  await waitFor(() => expect(document.activeElement).toBe(input));
  return user;
}

// 편집 모드까지 진입 (옛 calling 계약)
async function clickAndEdit(text: string) {
  const user = await clickText(text);
  const input = screen.getByDisplayValue(text) as HTMLInputElement;
  await user.keyboard("{Enter}");
  await waitFor(() => expect(input.readOnly).toBe(false));
  return user;
}

async function replaceFocusedText(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  const input = document.activeElement as HTMLInputElement;
  await user.keyboard("{Backspace}".repeat(from.length));
  if (to !== "") await user.keyboard(to);
  await waitFor(() => expect(input.value).toBe(to));
}

describe("outliner keyboard and mouse interactions", () => {
  test("mouse click enters select mode, Enter switches to edit, Escape returns to select", async () => {
    renderOutliner();
    const user = await clickText(firstItem);

    expect(statusText()).toMatch(/mode = select/);
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{Enter}");
    expect(statusText()).toMatch(/mode = edit/);
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{Escape}");
    expect(statusText()).toMatch(/mode = select/);

    await user.keyboard("{ArrowDown}");
    expect(statusText()).toMatch(/focus =\s*\/children\/1/);

    await user.keyboard("{ArrowUp}");
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{End}");
    expect(statusText()).toMatch(/focus =\s*\/children\/6\/children\/1/);

    await user.keyboard("{Home}");
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);
  });

  test("plain Enter edits only; Shift+Enter and Mod+Enter insert siblings", async () => {
    renderOutliner();
    const user = await clickText(firstItem);
    const before = treeTexts().length;

    await user.keyboard("{Enter}");
    expect(statusText()).toMatch(/mode = edit/);
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{Enter}");
    expect(treeTexts()).toHaveLength(before);
    expect(statusText()).toMatch(/mode = select/);
    expect(statusText()).toMatch(/focus =\s*\/children\/0/);

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await waitFor(() => expect(treeTexts()).toHaveLength(before + 1));
    await waitFor(() => expect(statusText()).toMatch(/focus =\s*\/children\/1/));

    fireEvent.keyDown(tree(), { key: "Enter", code: "Enter", ctrlKey: true, metaKey: true });
    expect(treeTexts()).toHaveLength(before + 2);
    expect(statusText()).toMatch(/focus =\s*\/children\/2/);
  });

  test("Mod+Enter is an insert-sibling chord in select and edit modes", () => {
    expect(findCommand("Mod+Enter", "select")).toBe("insert-sibling");
    expect(findCommand("Mod+Enter", "edit")).toBe("insert-sibling");
  });

  test("Cmd+D duplicates the focused row", async () => {
    renderOutliner();
    const user = await clickText(firstItem);
    const before = treeTexts().length;

    await user.keyboard("{Control>}d{/Control}");

    expect(treeTexts()).toHaveLength(before + 1);
    expect(treeTexts().filter((text) => text === firstItem)).toHaveLength(2);
    expect(statusText()).toMatch(/focus =\s*\/children\/1/);
  });

  test("ArrowRight and ArrowLeft navigate between a parent row and its first child", async () => {
    renderOutliner();
    const user = await clickText(selectionItem);

    await user.keyboard("{ArrowRight}");
    expect(statusText()).toMatch(/focus =\s*\/children\/4\/children\/0/);

    await user.keyboard("{ArrowLeft}");
    expect(statusText()).toMatch(/focus =\s*\/children\/4/);
  });

  test("Shift+click range selection and Ctrl+click toggle are visible in the DOM", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    expect(statusText()).toMatch(/selection =\s*1/);

    await user.keyboard("{Shift>}");
    await user.click(screen.getByDisplayValue(secondItem));
    await user.keyboard("{/Shift}");
    expect(statusText()).toMatch(/selection =\s*2/);
    expect(selectedRows()).toHaveLength(2);

    await user.keyboard("{Control>}");
    await user.click(screen.getByDisplayValue(firstItem));
    await user.keyboard("{/Control}");
    expect(statusText()).toMatch(/selection =\s*1/);
    expect(selectedRows()).toHaveLength(1);
    expect(rowForText(firstItem).getAttribute("aria-selected")).toBe("false");
    expect(rowForText(secondItem).getAttribute("aria-selected")).toBe("true");
  });

  test("Ctrl+A selects all visible non-root rows in select mode", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Control>}a{/Control}");

    expect(statusText()).toMatch(/selection =\s*17/);
    expect(selectedRows()).toHaveLength(17);
  });

  test("Shift+Arrow extends selection through visible rows", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(statusText()).toMatch(/focus =\s*\/children\/1/);
    expect(statusText()).toMatch(/selection =\s*2/);
    expect(selectedRows()).toHaveLength(2);

    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");

    expect(statusText()).toMatch(/focus =\s*\/children\/0/);
    expect(statusText()).toMatch(/selection =\s*1/);
  });

  test("pasting with an empty clipboard reports an error through rendered status", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Control>}v{/Control}");

    expect(screen.getByText("path_not_found: clipboard is empty")).toBeTruthy();
  });

  test("invalid external system clipboard reports parse failure instead of local empty state", async () => {
    const restoreClipboard = installSystemClipboard(() => "not json");
    try {
      renderOutliner();
      const user = userEvent.setup();

      await user.click(markerForText(firstItem));
      await user.keyboard("{Control>}v{/Control}");

      await waitFor(() => {
        expect(screen.getByText("clipboard_parse_failed: failed to parse clipboard text")).toBeTruthy();
      });
    } finally {
      restoreClipboard();
    }
  });

  test("invalid external clipboard clears stale cut status after failed paste", async () => {
    const restoreClipboard = installSystemClipboard(() => "not json");
    try {
      renderOutliner();
      const user = userEvent.setup();

      await user.click(markerForText(secondItem));
      await user.keyboard("{Control>}x{/Control}");
      expect(statusText()).toMatch(/clipboard =\s*cut 1/);

      await user.click(markerForText(selectionItem));
      await user.keyboard("{Control>}v{/Control}");

      await waitFor(() => {
        expect(screen.getByText("clipboard_parse_failed: failed to parse clipboard text")).toBeTruthy();
      });
      expect(statusText()).toMatch(/clipboard =\s*—/);
    } finally {
      restoreClipboard();
    }
  });

  test("copy and paste as sibling operate through keyboard shortcuts and rendered rows", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Control>}c{/Control}");
    expect(statusText()).toMatch(/clipboard =\s*copy 1/);

    await user.click(markerForText(secondItem));
    await user.keyboard("{Control>}v{/Control}");
    await user.keyboard("{Control>}v{/Control}");

    expect(treeTexts().filter((text) => text === firstItem)).toHaveLength(3);
    expect(document.querySelector(".toast")?.textContent ?? "").not.toMatch(/not_serializable|circular/i);
  });

  test("Tab demotes a row and Shift+Tab promotes it back through keyboard input", async () => {
    renderOutliner();
    const user = await clickText(secondItem);

    await user.keyboard("{Tab}");
    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("2");

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("1");
  });

  test("Tab and Shift+Tab preserve multi-row selection through outline moves", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(secondItem));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByDisplayValue(thirdItem));
    await user.keyboard("{/Shift}");
    expect(selectedRows()).toHaveLength(2);

    await user.keyboard("{Tab}");
    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("2");
    expect(rowForText(thirdItem).getAttribute("aria-level")).toBe("2");
    expect(selectedRows()).toHaveLength(2);

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("1");
    expect(rowForText(thirdItem).getAttribute("aria-level")).toBe("1");
    expect(selectedRows()).toHaveLength(2);
  });

  test("Ctrl+ArrowUp and Ctrl+ArrowDown move the focused row among siblings", async () => {
    renderOutliner();
    const user = await clickText(secondItem);

    await user.keyboard("{Control>}{ArrowUp}{/Control}");
    expect(treeTexts().slice(1, 3)).toEqual([secondItem, firstItem]);

    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(treeTexts().slice(1, 3)).toEqual([firstItem, secondItem]);
  });

  test("cut and paste as child move the selected row under the focused target", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(secondItem));
    await user.keyboard("{Control>}x{/Control}");
    expect(statusText()).toMatch(/clipboard =\s*cut 1/);

    await user.click(markerForText(selectionItem));
    await user.keyboard("{Control>}{Shift>}v{/Shift}{/Control}");

    expect(rowForText(secondItem).getAttribute("aria-level")).toBe("2");
    expect(statusText()).toMatch(/clipboard =\s*—/);
  });

  test("Backspace on an empty edited row removes that row through keyboard input", async () => {
    renderOutliner();
    const before = treeItems().length;
    const user = await clickAndEdit(firstItem);

    await replaceFocusedText(user, firstItem, "");
    await user.keyboard("{Backspace}");

    expect(treeItems()).toHaveLength(before - 1);
    expect(treeTexts()).not.toContain(firstItem);
  });

  test("Backspace on an empty edited root surfaces delete failure and stays in edit mode", async () => {
    renderOutliner();
    const before = treeItems().length;
    const user = await clickAndEdit("zod-crud outliner");

    await replaceFocusedText(user, "zod-crud outliner", "");
    await user.keyboard("{Backspace}");

    expect(screen.getByText("path_not_found: cannot delete root")).toBeTruthy();
    expect(statusText()).toMatch(/mode = edit/);
    expect(statusText()).toMatch(/focus =\s*·\s*selection/);
    expect(treeItems()).toHaveLength(before);
  });

  test("Backspace removes a mouse-selected range of rows", async () => {
    renderOutliner();
    const user = userEvent.setup();

    await user.click(markerForText(firstItem));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByDisplayValue(thirdItem));
    await user.keyboard("{/Shift}");
    expect(statusText()).toMatch(/selection =\s*3/);

    await user.keyboard("{Backspace}");

    expect(treeTexts()).not.toContain(firstItem);
    expect(treeTexts()).not.toContain(secondItem);
    expect(treeTexts()).not.toContain(thirdItem);
  });

  test("save and restore draft through the persistence extension", async () => {
    globalThis.localStorage?.removeItem(draftKey);
    renderOutliner();
    const user = await clickAndEdit(firstItem);

    await replaceFocusedText(user, firstItem, editedFirstItem);
    await waitFor(() => expect(statusText()).toMatch(/dirty =\s*yes/));

    await user.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(statusText()).toMatch(/dirty =\s*no/));

    await user.click(screen.getByDisplayValue(editedFirstItem));
    await user.keyboard("{Enter}");
    await replaceFocusedText(user, editedFirstItem, "Unsaved draft");
    await waitFor(() => expect(statusText()).toMatch(/dirty =\s*yes/));

    await user.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() => expect(treeTexts()).toContain(editedFirstItem));
    expect(treeTexts()).not.toContain("Unsaved draft");
    expect(statusText()).toMatch(/dirty =\s*no/);
  });

  test("restore reports missing draft without changing the rendered document", async () => {
    globalThis.localStorage?.removeItem(draftKey);
    renderOutliner();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() => {
      expect(toastTexts().some((text) => text.includes("persistence_empty"))).toBe(true);
    });
    expect(treeTexts()).toContain(firstItem);
  });

  test("restore reports corrupt draft payload without changing the rendered document", async () => {
    globalThis.localStorage?.setItem(draftKey, "not json");
    renderOutliner();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() => {
      expect(toastTexts().some((text) => text.includes("persistence_parse_failed"))).toBe(true);
    });
    expect(treeTexts()).toContain(firstItem);
  });

  test("restore reports schema-invalid draft payload without changing the rendered document", async () => {
    globalThis.localStorage?.setItem(draftKey, defaultDocumentPersistenceCodec.encode({
      value: {
        text: "invalid",
        children: [{ text: 123, children: [] }],
      },
      selection: null,
      savedAt: "2026-05-28T00:00:00.000Z",
    }));
    renderOutliner();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() => {
      expect(toastTexts().some((text) => text.includes("schema_violation"))).toBe(true);
    });
    expect(treeTexts()).toContain(firstItem);
  });

  test("restore skips persisted selection that points outside the restored draft", async () => {
    globalThis.localStorage?.setItem(draftKey, defaultDocumentPersistenceCodec.encode({
      value: {
        text: "restored outline",
        children: [{ text: "safe restored row", children: [] }],
      },
      selection: {
        selectedPointers: ["/children/99"],
        selectionRanges: [{ anchor: "/children/99", focus: "/children/99" }],
        primaryIndex: 0,
        anchor: "/children/99",
        focus: "/children/99",
      },
      savedAt: "2026-05-28T00:00:00.000Z",
    }));
    renderOutliner();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() => expect(treeTexts()).toContain("safe restored row"));
    expect(toastTexts()).toContain("restored");
    expect(statusText()).not.toContain("/children/99");
  });

  test("save reports localStorage write failures and keeps the draft dirty", async () => {
    renderOutliner();
    const user = await clickAndEdit(firstItem);
    await replaceFocusedText(user, firstItem, editedFirstItem);
    await waitFor(() => expect(statusText()).toMatch(/dirty =\s*yes/));

    const restoreStorage = installLocalStorageHost({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage denied");
      },
      removeItem: () => undefined,
    });
    try {
      await user.click(screen.getByRole("button", { name: "save" }));

      await waitFor(() => {
        expect(toastTexts().some((text) => text.includes("persistence_write_failed"))).toBe(true);
      });
      expect(statusText()).toMatch(/dirty =\s*yes/);
    } finally {
      restoreStorage();
    }
  });

  test("reset button restores the initial rendered document after keyboard edits", async () => {
    renderOutliner();
    const user = await clickAndEdit(firstItem);

    await replaceFocusedText(user, firstItem, editedFirstItem);
    expect(treeTexts()).toContain(editedFirstItem);

    await user.click(screen.getByRole("button", { name: "reset" }));

    expect(treeTexts()).toContain(firstItem);
    expect(treeTexts()).not.toContain(editedFirstItem);
    expect(statusText()).toMatch(/mode = select/);
  });
});
