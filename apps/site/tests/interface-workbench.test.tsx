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
      "doc.patch",
      "doc.run",
      "doc.selection",
      "clipboard buffer",
      "doc.history",
      "doc.read",
      "doc.plan",
      "doc.schema",
      "pure exports",
      "zod-crud API",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getByText(/Zod schema로 보호되는 JSON 편집 엔진/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "먼저 잡아야 할 모델" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "실행 전 확인: doc.plan" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "사용자 액션 실행: doc.run" })).toBeTruthy();
    expect(screen.getByText(/읽기만 하면/)).toBeTruthy();
    expect(screen.getAllByText(/createJSONDocument/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SelectionState/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/useJSONDocument/).length).toBeGreaterThan(0);
  });

  test("runs representative ops, selection, clipboard, and schema actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.click(within(group("doc.patch")).getByRole("button", { name: "add" }));
    expect(screen.getByText("Card c4")).toBeTruthy();

    await user.click(within(group("doc.selection")).getByRole("button", { name: "todo" }));
    expect(screen.getByText("selected: 3")).toBeTruthy();

    await user.click(within(group("clipboard buffer")).getByRole("button", { name: "copy" }));
    expect(screen.getByText("clipboard: set")).toBeTruthy();

    await user.click(within(group("clipboard buffer")).getByRole("button", { name: "paste" }));
    expect(screen.getAllByText("Patch API").length).toBeGreaterThan(1);

    await user.click(within(group("doc.schema")).getByRole("button", { name: "rejects" }));
    expect(screen.getByRole("heading", { name: "schema.rejects" })).toBeTruthy();
    expect(screen.getByText(/schema_violation/)).toBeTruthy();

    await user.click(within(group("pure exports")).getByRole("button", { name: "inspect" }));
    expect(screen.getAllByRole("heading", { name: "pure exports" }).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(0);
  });
});
