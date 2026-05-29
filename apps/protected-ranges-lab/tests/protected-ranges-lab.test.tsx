import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

function renderLab() {
  render(<App />);
}

function documentPanel() {
  return screen.getByLabelText("page document");
}

describe("protected ranges lab dogfood", () => {
  test("shows protected commands as disabled through can results", () => {
    renderLab();

    expect((screen.getByRole("button", { name: "replace title" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "replace slug" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "insert before legal" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "append section" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(screen.getByLabelText("protected ranges")).getByText("/slug")).toBeTruthy();
    expect(within(screen.getByLabelText("protected ranges")).getByText("/sections/1")).toBeTruthy();
  });

  test("allows unprotected commands and keeps protected values stable", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "replace title" }));
    await user.click(screen.getByRole("button", { name: "append section" }));

    expect(within(documentPanel()).getByText("Updated release page")).toBeTruthy();
    expect(within(documentPanel()).getByText("release-page")).toBeTruthy();
    expect(within(documentPanel()).getByText("tail-3")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("append section");
  });
});
