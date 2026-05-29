import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

function renderLab() {
  render(<App />);
}

function stateText() {
  return within(screen.getByLabelText("document state")).getByText((_, node) => node?.tagName === "PRE").textContent ?? "";
}

describe("schema form lab dogfood", () => {
  test("renders nested field descriptors without app-owned pointer construction", () => {
    renderLab();

    expect(screen.getByRole("heading", { name: "Schema form lab" })).toBeTruthy();
    expect(screen.getByLabelText("/title")).toBeTruthy();
    expect(screen.getByLabelText("/seo/title")).toBeTruthy();
    expect(screen.getByLabelText("/blocks/0/text")).toBeTruthy();
    expect(screen.getByLabelText("/blocks/1/href")).toBeTruthy();
  });

  test("commits scalar, enum, and boolean form drafts through descriptor paths", async () => {
    renderLab();
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText("/title"), {
      target: { value: "Published page" },
    });
    await user.selectOptions(screen.getByLabelText("/status"), "review");
    await user.click(screen.getByLabelText("/published"));

    expect(stateText()).toContain('"title": "Draft page"');
    await user.click(screen.getByRole("button", { name: "commit drafts" }));

    expect(stateText()).toContain('"title": "Published page"');
    expect(stateText()).toContain('"status": "review"');
    expect(stateText()).toContain('"published": true');
    expect(screen.getByRole("status").textContent).toBe("committed 3 draft(s)");
  });

  test("drafts a discriminated-union branch field before mutating document state", async () => {
    renderLab();
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText("/blocks/0/text"), {
      target: { value: "Updated body" },
    });

    expect(stateText()).not.toContain('"text": "Updated body"');
    expect(screen.getByRole("status").textContent).toBe("draft /blocks/0/text");
    await user.click(screen.getByRole("button", { name: "commit drafts" }));

    expect(stateText()).toContain('"text": "Updated body"');
  });

  test("keeps invalid payloads in draft state before mutating document state", () => {
    renderLab();

    fireEvent.change(screen.getByLabelText("/blocks/1/href"), {
      target: { value: "not-a-url" },
    });

    expect(screen.getByLabelText("/blocks/1/href")).toHaveProperty("value", "not-a-url");
    expect(stateText()).toContain('"href": "https://example.com/docs"');
    expect(stateText()).not.toContain("not-a-url");
    expect(screen.getByRole("status").textContent).toBe("schema_violation: /blocks/1/href");
    expect((screen.getByRole("button", { name: "commit drafts" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
