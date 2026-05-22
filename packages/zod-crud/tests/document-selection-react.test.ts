// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import { useJSONDocument } from "../src/api/react.js";

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
  test("selection methods use the configured selection mode", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    }));

    act(() => {
      hook.current.selection?.addRange("/items/0");
      hook.current.selection?.addRange("/items/1");
    });

    expect(hook.current.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(hook.current.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(hook.current.selection?.primaryIndex).toBe(1);
    expect(hook.current.selection?.rangeCount).toBe(2);
    expect(hook.current.selection?.selectedCount).toBe(2);
    expect(hook.current.selection?.hasSelection).toBe(true);
    expect(hook.current.selection?.isSelected("/items/0")).toBe(true);
    expect(hook.current.selection?.isSelected("/items/1")).toBe(true);
    expect(hook.current.selection?.isSelected("/items/9")).toBe(false);
    expect(hook.current.selection?.primaryRange).toEqual({ anchor: "/items/1", focus: "/items/1" });
    expect(hook.current.selection?.anchorPointer).toBe("/items/1");
    expect(hook.current.selection?.focusPointer).toBe("/items/1");
    expect(hook.current.selection?.selectedSource).toEqual(["/items/0", "/items/1"]);
    expect(hook.current.selection?.primaryPointer).toBe("/items/1");
    expect(hook.current.selection?.caret).toBe(null);
    expect(hook.current.selection?.caretPointer).toBe(null);
  });

  test("initial selection accepts explicit JSONPoint ranges through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: {
        mode: "multiple",
        initial: [
          { anchor: "/items/0", focus: "/items/0" },
          {
            anchor: { path: "/items/1/name", offset: 99, affinity: "forward" },
            focus: { path: "/items/1/name", offset: 99, affinity: "forward" },
          },
        ],
      },
    }));

    expect(hook.current.selection?.selectedPointers).toEqual(["/items/0", "/items/1/name"]);
    expect(hook.current.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/1/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/1/name", offset: 1, affinity: "forward" },
      },
    ]);
    expect(hook.current.selection?.primaryIndex).toBe(1);
    expect(hook.current.selection?.primaryPointer).toBe("/items/1/name");
    expect(hook.current.selection?.caret).toBe(null);
  });

  test("selection context is exposed through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: {
        mode: "single",
        initial: [{ path: "/items/0/name", offset: 1 }],
        context: { marks: ["bold"] },
      },
    }));

    expect(hook.current.selection?.context).toEqual({ marks: ["bold"] });
    expect(hook.current.selection?.toJSON().context).toEqual({ marks: ["bold"] });

    act(() => {
      hook.current.selection?.setContext({ marks: ["italic"] });
    });

    expect(hook.current.selection?.context).toEqual({ marks: ["italic"] });

    act(() => {
      hook.current.selection?.clearContext();
    });

    expect(hook.current.selection?.context).toBeUndefined();
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
    expect(hook.current.selection?.rangeCount).toBe(1);
    expect(hook.current.selection?.selectedCount).toBe(1);
    expect(hook.current.selection?.hasSelection).toBe(true);
    expect(hook.current.selection?.isSelected("/items/0/name")).toBe(true);
    expect(hook.current.selection?.anchorPointer).toBe("/items/0/name");
    expect(hook.current.selection?.focusPointer).toBe("/items/0/name");
    expect(hook.current.selection?.selectedSource).toBe("/items/0/name");
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(hook.current.selection?.caretPointer).toBe("/items/0/name");
  });

  test("clamps collapsed caret offsets through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    }));

    act(() => {
      hook.current.selection?.collapse({ path: "/items/0/name", offset: 99, affinity: "forward" });
    });

    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
    expect(hook.current.selection?.primaryPointer).toBe("/items/0/name");
  });

  test("selection getters and snapshot expose value copies through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    }));
    const point = { path: "/items/0/name" as const, offset: 1, affinity: "forward" as const };

    act(() => {
      hook.current.selection?.collapse(point);
    });

    point.offset = 99;
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const caret = hook.current.selection?.caret;
    if (caret === undefined || caret === null || typeof caret === "string") throw new Error("expected JSONPoint object");
    caret.offset = 88;
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const primaryRange = hook.current.selection?.primaryRange;
    if (primaryRange === undefined || primaryRange === null || typeof primaryRange.anchor === "string") {
      throw new Error("expected JSONPoint object");
    }
    primaryRange.anchor.offset = 66;
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const selectionRange = hook.current.selection?.selectionRanges[0];
    if (selectionRange === undefined || typeof selectionRange.anchor === "string") {
      throw new Error("expected JSONPoint object");
    }
    selectionRange.anchor.offset = 55;
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const snapshot = hook.current.selection?.snapshot();
    const snapshotAnchor = snapshot?.selectionRanges[0]?.anchor;
    if (snapshotAnchor === undefined || typeof snapshotAnchor === "string") throw new Error("expected JSONPoint object");
    snapshotAnchor.offset = 77;
    expect(hook.current.selection?.caret).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
  });

  test("selection serializes to its snapshot through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "single" },
    }));

    act(() => {
      hook.current.selection?.collapse({ path: "/items/0/name", offset: 1, affinity: "forward" });
    });

    expect(hook.current.selection?.toJSON()).toEqual(hook.current.selection?.snapshot());
    expect(JSON.parse(JSON.stringify(hook.current.selection))).toEqual(hook.current.selection?.snapshot());
  });

  test("selection restores serialized snapshots through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    }));

    act(() => {
      hook.current.selection?.selectRanges([
        { anchor: "/items/0", focus: "/items/0" },
        {
          anchor: { path: "/items/1/name", offset: 99, affinity: "forward" },
          focus: { path: "/items/1/name", offset: 99, affinity: "forward" },
        },
      ]);
    });
    const saved = JSON.parse(JSON.stringify(hook.current.selection));

    act(() => {
      hook.current.selection?.empty();
      hook.current.selection?.restore(saved);
    });

    expect(hook.current.selection?.selectedPointers).toEqual(["/items/0", "/items/1/name"]);
    expect(hook.current.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/1/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/1/name", offset: 1, affinity: "forward" },
      },
    ]);
    expect(hook.current.selection?.primaryIndex).toBe(1);
    expect(hook.current.selection?.primaryPointer).toBe("/items/1/name");
  });

  test("selectRanges dedupes repeated ranges through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    }));

    act(() => {
      hook.current.selection?.selectRanges(["/items/0", "/items/1", "/items/0"], undefined, undefined, 2);
    });

    expect(hook.current.selection?.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(hook.current.selection?.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(hook.current.selection?.primaryIndex).toBe(0);
    expect(hook.current.selection?.primaryPointer).toBe("/items/0");
  });

  test("clipboard copy defaults to current selection through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      selection: { mode: "multiple" },
    }));

    act(() => {
      hook.current.selection?.addRange("/items/0");
      hook.current.selection?.addRange("/items/1");
    });

    let copied: ReturnType<typeof hook.current.clipboard.copy> | undefined;
    act(() => {
      copied = hook.current.clipboard.copy();
    });
    expect(copied).toMatchObject({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });

    expect(hook.current.clipboard.read()).toEqual({
      ok: true,
      payload: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      source: "/items/0",
      sources: ["/items/0", "/items/1"],
    });
  });

  test("clipboard paste can use an explicit payload and the current selection target", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    }));

    act(() => {
      hook.current.clipboard.pastePayload({ after: "/items/0" }, { id: "x", name: "X" });
    });

    expect(hook.current.value.items.map((item) => item.id)).toEqual(["a", "x", "b"]);
    expect(hook.current.history.undoDepth).toBe(1);
  });

  test("patch replaces the current selection target through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0/name"] },
    }));

    act(() => {
      hook.current.patch({ op: "replace", path: hook.current.selection?.primaryPointer ?? "/items/0/name", value: "A1" });
    });

    expect(hook.current.value.items[0]?.name).toBe("A1");
    expect(hook.current.history.undoDepth).toBe(1);
  });

  test("JSON Patch copy duplicates the current primary selection through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    }));

    act(() => {
      const source = hook.current.selection?.primaryPointer ?? "/items/0";
      hook.current.patch({ op: "copy", from: source, path: "/items/1" });
    });

    expect(hook.current.value.items.map((item) => item.id)).toEqual(["a", "a", "b"]);
    expect(hook.current.history.undoDepth).toBe(1);
  });

  test("JSON Patch move uses the current primary selection source through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, {
      history: 10,
      selection: { mode: "single", initial: ["/items/0"] },
    }));

    act(() => {
      const source = hook.current.selection?.primaryPointer ?? "/items/0";
      hook.current.patch({ op: "move", from: source, path: "/items/1" });
    });

    expect(hook.current.value.items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(hook.current.history.undoDepth).toBe(1);
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
