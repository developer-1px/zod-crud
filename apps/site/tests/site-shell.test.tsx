import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { App } from "../src/App";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("official site shell", () => {
  test("serves the official overview at the root route", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main-content");
    expect(screen.getByRole("heading", { level: 1, name: "zod-crud" })).toBeTruthy();
    expect(screen.getByText(/Zod-guarded JSON editing/)).toBeTruthy();
    expect(screen.getByText("npm install zod-crud zod")).toBeTruthy();
    expect(screen.getByText("npm run verify")).toBeTruthy();
    expect(screen.queryByText("Interface bench")).toBeNull();
  });

  test("navigates from the official site to docs and demos", async () => {
    render(<App />);
    const user = userEvent.setup();
    const nav = within(screen.getByRole("navigation", { name: "Site navigation" }));

    await user.click(nav.getByRole("link", { name: "API reference" }));
    expect(screen.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "작업별 진입점" })).toBeTruthy();

    await user.click(nav.getByRole("link", { name: "Workbench" }));
    expect(screen.getByText("Interface bench")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "zod-crud API" })).toBeTruthy();
  });

  test("supports direct route entry for static-hosting fallbacks", () => {
    window.history.pushState(null, "", "/docs");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "API reference" }).getAttribute("aria-current")).toBe("page");
  });
});
