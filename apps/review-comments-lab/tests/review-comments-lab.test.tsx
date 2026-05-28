import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/App.js";

afterEach(cleanup);

function renderLab() {
  render(<App />);
}

function commentsPanel() {
  return screen.getByLabelText("comments");
}

function allComments() {
  return within(commentsPanel()).getByText("All comments").nextElementSibling as HTMLElement;
}

describe("review comments lab dogfood", () => {
  test("starts with seeded pointer-anchored comments", () => {
    renderLab();

    expect(screen.getByRole("heading", { name: "Review comments lab" })).toBeTruthy();
    expect(screen.getByLabelText("open comments").textContent).toBe("2");
    expect(within(allComments()).getByText("heading-review")).toBeTruthy();
    expect(within(allComments()).getByText("/sections/0/heading")).toBeTruthy();
    expect(within(allComments()).getByText("api-review")).toBeTruthy();
    expect(within(allComments()).getByText("/sections/1/body")).toBeTruthy();
  });

  test("adds a comment to the selected target through the extension", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText("select /sections/1/body"));
    await user.clear(screen.getByLabelText("comment text"));
    await user.type(screen.getByLabelText("comment text"), "Add migration note.");
    await user.click(screen.getByRole("button", { name: "add comment" }));

    expect(screen.getByLabelText("open comments").textContent).toBe("3");
    expect(within(allComments()).getByText("comment-1")).toBeTruthy();
    expect(within(allComments()).getAllByText("/sections/1/body").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toBe("comment comment-1");
  });

  test("resolves and reopens comments without mutating document state", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(within(allComments()).getByRole("button", { name: "resolve heading-review" }));

    expect(screen.getByLabelText("open comments").textContent).toBe("1");
    expect(screen.getByLabelText("resolved comments").textContent).toBe("1");
    expect(within(allComments()).getByRole("button", { name: "reopen heading-review" })).toBeTruthy();
    expect(screen.getByText("Intro")).toBeTruthy();
  });

  test("tracks comment anchors after structural insertion", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "insert before /sections/0" }));

    expect(within(allComments()).getByText("heading-review")).toBeTruthy();
    expect(within(allComments()).getByText("/sections/1/heading")).toBeTruthy();
    expect(within(allComments()).getByText("/sections/2/body")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("insert section");
  });

  test("marks deleted anchors as lost", async () => {
    renderLab();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "delete /sections/1" }));

    expect(screen.getByLabelText("lost comments").textContent).toBe("1");
    expect(within(allComments()).getByText("api-review")).toBeTruthy();
    expect(within(allComments()).getByText("lost")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("delete /sections/1");
  });
});
