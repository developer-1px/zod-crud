import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App.js";

const clipboardStore = { text: "" };
let writeTextSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clipboardStore.text = "";
  writeTextSpy = vi.fn(async (value: string) => {
    clipboardStore.text = value;
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(async () => clipboardStore.text),
      writeText: writeTextSpy,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCms() {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Mobile CMS" })).toBeTruthy();
}

function previewButtons() {
  return document.querySelectorAll(".preview-button");
}

function productCollections() {
  return document.querySelectorAll(".block-productGrid");
}

function firstProductCollection() {
  const product = document.querySelector(".block-productGrid");
  if (!(product instanceof HTMLElement)) throw new Error("Missing product collection");
  return product;
}

function editableText(value: string) {
  const target = Array.from(document.querySelectorAll("[contenteditable='true']")).find((element) => element.textContent === value);
  if (!(target instanceof HTMLElement)) throw new Error(`Missing editable text: ${value}`);
  return target;
}

describe("mobile CMS usable editing surface", () => {
  test("renders a shortcut-driven editor without command buttons", () => {
    renderCms();

    expect(document.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByText("Cmd/Ctrl+C")).toBeTruthy();
    expect(screen.getByText("Cmd/Ctrl+V")).toBeTruthy();
    expect(document.querySelectorAll("[contenteditable='true']").length).toBeGreaterThan(0);
  });

  test("copies a collection with keyboard shortcut and pastes it only into an allowed schema slot", async () => {
    renderCms();
    const user = userEvent.setup();

    expect(productCollections()).toHaveLength(1);

    await user.click(firstProductCollection());
    await user.keyboard("{Control>}c{/Control}");
    await waitFor(() => expect(screen.getByText(/Copied Product grid/)).toBeTruthy());

    await user.click(screen.getByText("Editorial content"));
    await user.keyboard("{Control>}v{/Control}");
    await waitFor(() => expect(screen.getAllByText(/product grid is not allowed in Editorial content/).length).toBeGreaterThan(0));
    expect(productCollections()).toHaveLength(1);

    await user.click(screen.getByText("Shop area"));
    await user.keyboard("{Control>}v{/Control}");
    await waitFor(() => expect(productCollections()).toHaveLength(2));
  });

  test("selecting and editing text does not trigger block copy paste shortcuts", async () => {
    renderCms();
    const user = userEvent.setup();

    const text = editableText("Mobile CMS");
    await user.click(text);
    await user.keyboard("x");

    expect(text.textContent).toContain("x");

    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("{Control>}c{/Control}");
    await user.keyboard("{Control>}v{/Control}");

    expect(text.textContent).toContain("x");
    expect(previewButtons()).toHaveLength(1);
    expect(writeTextSpy).not.toHaveBeenCalled();
  });

  test("copies a palette atom with mouse selection and keyboard paste into an allowed container", async () => {
    renderCms();
    const user = userEvent.setup();

    expect(previewButtons()).toHaveLength(1);

    await user.click(screen.getByRole("option", { name: "Button button" }));
    await user.click(screen.getByText("Shop area"));
    await user.keyboard("{Control>}v{/Control}");

    await waitFor(() => expect(previewButtons()).toHaveLength(2));
  });
});
