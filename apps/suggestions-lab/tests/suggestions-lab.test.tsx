import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

describe("suggestions lab dogfood", () => {
  test("shows proposal capabilities", () => {
    render(<App />);

    expect((screen.getByRole("button", { name: "propose title" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "propose invalid" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "accept first" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByLabelText("document")).getByText("Draft page")).toBeTruthy();
  });

  test("proposes and accepts a document change", async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "propose title" }));

    expect(screen.getByRole("status").textContent).toBe("proposed suggestion-1");
    expect(within(screen.getByLabelText("document")).getByText("Draft page")).toBeTruthy();
    expect((screen.getByRole("button", { name: "accept first" }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "accept first" }));

    expect(screen.getByRole("status").textContent).toBe("accepted suggestion-1");
    expect(within(screen.getByLabelText("document")).getByText("Reviewed page")).toBeTruthy();
    expect(within(screen.getByLabelText("suggestions")).getByText("accepted")).toBeTruthy();
  });

  test("surfaces stale proposals after a direct edit", async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "propose title" }));
    await user.click(screen.getByRole("button", { name: "direct edit" }));

    expect(within(screen.getByLabelText("document")).getByText("Edited directly")).toBeTruthy();
    expect((screen.getByRole("button", { name: "accept first" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByRole("button", { name: "accept first" })).getByText("stale_suggestion")).toBeTruthy();
  });
});
