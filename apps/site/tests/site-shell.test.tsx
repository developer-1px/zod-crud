import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { App } from "../src/App";

beforeEach(() => {
  document.head.innerHTML = [
    '<meta property="og:title" content="" />',
    '<meta property="og:url" content="" />',
    '<link rel="canonical" href="" />',
  ].join("");
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
    expect(screen.getByRole("link", { name: "npm" }).getAttribute("href")).toBe("https://www.npmjs.com/package/zod-crud");
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe("https://github.com/developer-1px/zod-crud");
    expect(screen.queryByText("Interface bench")).toBeNull();
  });

  test("navigates from the official site to docs and demos", async () => {
    render(<App />);
    const user = userEvent.setup();
    const nav = within(screen.getByRole("navigation", { name: "Site navigation" }));

    await user.click(nav.getByRole("link", { name: "API reference" }));
    await waitFor(() => expect(document.title).toBe("zod-crud API - zod-crud"));
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://developer-1px.github.io/zod-crud/docs");
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe("https://developer-1px.github.io/zod-crud/docs");
    expect(screen.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "작업별 진입점" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeTruthy();
    const mobileSections = within(screen.getByRole("navigation", { name: "Documentation sections" }));
    expect(mobileSections.getByRole("link", { name: "작업별 진입점" }).getAttribute("href")).toBe("#작업별-진입점");

    await user.click(nav.getByRole("link", { name: "Workbench" }));
    expect(screen.getByText("Interface bench")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "zod-crud API" })).toBeTruthy();
  });

  test("supports direct route entry for static-hosting fallbacks", () => {
    window.history.pushState(null, "", "/docs/");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "zod-crud API" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "API reference" }).getAttribute("aria-current")).toBe("page");
    expect(document.getElementById("작업별-진입점")).toBeTruthy();
  });
});
