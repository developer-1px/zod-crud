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
    expect(screen.getByLabelText("value target")).toBeTruthy();
    expect(screen.getByLabelText("insert target")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "작업별 진입점" })).toBeTruthy();
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    expect(screen.getByText(/외부 payload 붙여넣기/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "배경" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Core concept" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "튜토리얼: 작은 카드 편집기 만들기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이걸로 할 수 있는 것들" })).toBeTruthy();
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
      "zod-crud API",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getByText(/Zod schema로 보호되는 JSON 편집 엔진/)).toBeTruthy();
    expect(screen.getByText(/프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일/)).toBeTruthy();
    expect(screen.getByText(/검색: JSONPath -> Pointer\[\]/)).toBeTruthy();
    expect(screen.getByText(/작은 카드 편집기 만들기/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "기준" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "clipboard" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "can*" })).toBeTruthy();
    expect(screen.getByText(/query: JSONPath -> Pointer/)).toBeTruthy();
    expect(screen.getByText(/JSONPath는 변경 언어가 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/doc\.query\("\$\.lists\[\*\]\.cards\[\*\]"\)/)).toBeTruthy();
    expect(screen.getByText(/source를 생략하면 현재 selection을 사용합니다/)).toBeTruthy();
    expect(screen.getByText(/blocked\.violations/)).toBeTruthy();
    expect(screen.getAllByText(/createJSONDocument/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SelectionState/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/useJSONDocument/).length).toBeGreaterThan(0);
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

  test("runs representative ops, selection, clipboard, and schema actions", async () => {
    render(<InterfaceWorkbench />);
    const user = userEvent.setup();

    await user.click(within(group("doc.patch")).getByRole("button", { name: "add" }));
    expect(screen.getByText("Card c4")).toBeTruthy();

    await user.click(within(group("doc.selection")).getByRole("button", { name: "select todo" }));
    expect(screen.getByText("selected: 3")).toBeTruthy();

    await user.click(within(group("doc.clipboard")).getByRole("button", { name: "copy" }));
    expect(screen.getByText("clipboard: set")).toBeTruthy();

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
    expect(screen.getAllByText(/doc\.schema\.accepts/).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/schema_violation/).length).toBeGreaterThan(1);

    await user.click(within(group("pure exports")).getByRole("button", { name: "inspect" }));
    expect(screen.getAllByText(/applyPatch/).length).toBeGreaterThan(1);
  });
});
