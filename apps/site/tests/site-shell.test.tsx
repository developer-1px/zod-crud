import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";

beforeEach(() => {
  document.head.innerHTML = [
    '<meta name="description" content="" />',
    '<meta property="og:title" content="" />',
    '<meta property="og:description" content="" />',
    '<meta property="og:url" content="" />',
    '<meta name="twitter:title" content="" />',
    '<meta name="twitter:description" content="" />',
    '<link rel="canonical" href="" />',
  ].join("");
  Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
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

  test("navigates from the official site to docs, API reference, and demos", async () => {
    render(<App />);
    const user = userEvent.setup();
    const nav = within(screen.getByRole("navigation", { name: "Site navigation" }));

    await user.click(nav.getByRole("link", { name: "Docs" }));
    await waitFor(() => expect(document.title).toBe("zod-crud Docs - zod-crud"));
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("User guide to zod-crud's schema-first editing flow, can* checks, changes, results, and history.");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://developer-1px.github.io/zod-crud/docs");
    expect(await screen.findByRole("heading", { level: 1, name: "zod-crud Docs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "배경" })).toBeTruthy();
    expect(screen.getAllByRole("navigation", { name: "Documentation pages" }).length).toBeGreaterThan(0);

    await user.click(nav.getByRole("link", { name: "API reference" }));
    await waitFor(() => expect(document.title).toBe("zod-crud API - zod-crud"));
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Public zod-crud API reference for document changes, can* checks, selection, clipboard, history, Pointer, and JSONPath.");
    expect(document.head.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe("Public zod-crud API reference for document changes, can* checks, selection, clipboard, history, Pointer, and JSONPath.");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://developer-1px.github.io/zod-crud/docs/api");
    expect(document.head.querySelector('meta[name="twitter:title"]')?.getAttribute("content")).toBe("zod-crud API - zod-crud");
    expect(document.head.querySelector('meta[name="twitter:description"]')?.getAttribute("content")).toBe("Public zod-crud API reference for document changes, can* checks, selection, clipboard, history, Pointer, and JSONPath.");
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe("https://developer-1px.github.io/zod-crud/docs/api");
    expect(await screen.findByRole("heading", { level: 1, name: "zod-crud API" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "작업별 진입점" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeTruthy();
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    const mobileSections = within(screen.getByRole("navigation", { name: "Documentation sections" }));
    expect(mobileSections.getByRole("link", { name: "작업별 진입점" }).getAttribute("href")).toBe("#작업별-진입점");

    await user.click(nav.getByRole("link", { name: "Workbench" }));
    expect(await screen.findByText("Interface bench", {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Board setup" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "zod-crud API" })).toBeNull();
  });

  test("supports direct route entry for static-hosting fallbacks", async () => {
    window.history.pushState(null, "", "/docs/");
    render(<App />);
    const nav = within(screen.getByRole("navigation", { name: "Site navigation" }));

    expect(await screen.findByRole("heading", { level: 1, name: "zod-crud Docs" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.getElementById("배경")).toBeTruthy());

    window.history.pushState(null, "", "/docs/api/");
    window.dispatchEvent(new Event("popstate"));
    expect(await screen.findByRole("heading", { level: 1, name: "zod-crud API" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "API reference" }).getAttribute("aria-current")).toBe("page");
    await waitFor(() => expect(document.getElementById("작업별-진입점")).toBeTruthy());
  });
});
