// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import { useJSONDocument } from "../src/hooks/useJSONDocument.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useJSONDocument doc.selection", () => {
  test("commands.select defaults to the configured selection mode", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    }));

    act(() => {
      hook.current.commands.select({ type: "addRange", pointer: "/items/0" });
      hook.current.commands.select({ type: "addRange", pointer: "/items/1" });
    });

    expect(hook.current.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(hook.current.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(hook.current.selection?.primaryIndex).toBe(1);
    expect(hook.current.selection?.primaryRange).toEqual({ anchor: "/items/1", focus: "/items/1" });
    expect(hook.current.selection?.primaryPointer).toBe("/items/1");
    expect(hook.current.selection?.caret).toBe(null);
    expect(hook.current.selection?.caretPointer).toBe(null);
  });

  test("exposes collapsed caret directly", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    }));

    act(() => {
      hook.current.selection?.collapse({ path: "/items/0/name", offset: 1, affinity: "forward" });
    });

    expect(hook.current.selection?.primaryRange).toEqual({
      anchor: { path: "/items/0/name", offset: 1, affinity: "forward" },
      focus: { path: "/items/0/name", offset: 1, affinity: "forward" },
    });
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(hook.current.selection?.caretPointer).toBe("/items/0/name");
  });
});

function renderHook<T>(hook: () => T): { readonly current: T } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  const result: { current?: T } = {};
  function Component() {
    result.current = hook();
    return null;
  }

  act(() => {
    root.render(createElement(Component));
  });

  return {
    get current() {
      if (result.current === undefined) throw new Error("hook did not render");
      return result.current;
    },
  };
}
