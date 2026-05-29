import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

describe("grouping lab dogfood", () => {
  test("shows can results on commands", () => {
    render(<App />);

    expect((screen.getByRole("button", { name: "group" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "ungroup" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByLabelText("selection")).getByText("/items/0")).toBeTruthy();
    expect(within(screen.getByLabelText("selection")).getByText("/items/1")).toBeTruthy();
  });

  test("groups and ungroups selected items through the extension", async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "group" }));

    expect(screen.getByRole("status").textContent).toBe("group");
    expect(within(screen.getByLabelText("items")).getByText("Group 2")).toBeTruthy();
    expect(within(screen.getByLabelText("selection")).getByText("/items/0")).toBeTruthy();
    expect((screen.getByRole("button", { name: "ungroup" }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "ungroup" }));

    expect(screen.getByRole("status").textContent).toBe("ungroup");
    expect(within(screen.getByLabelText("items")).queryByText("Group 2")).toBeNull();
    expect(within(screen.getByLabelText("items")).getByText("Intro")).toBeTruthy();
    expect(within(screen.getByLabelText("items")).getByText("Draft")).toBeTruthy();
  });
});
