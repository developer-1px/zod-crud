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

describe("useJSONDocument doc.clipboard", () => {
  test("copies and pastes through the React facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, { history: 10 }));

    act(() => {
      hook.current.clipboard.copy("/items/0");
    });

    expect(hook.current.clipboard.hasData).toBe(true);
    expect(hook.current.clipboard.source).toBe("/items/0");

    act(() => {
      hook.current.clipboard.paste("/items/-");
    });

    expect(hook.current.value.items.map((item) => item.id)).toEqual(["a", "b", "a"]);
    expect(hook.current.history.undoDepth).toBe(1);
  });

  test("failed paste keeps buffer and state", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, { history: 10 }));

    act(() => {
      hook.current.clipboard.copy("/items/0");
    });

    let failed: ReturnType<typeof hook.current.clipboard.paste> | undefined;
    act(() => {
      failed = hook.current.clipboard.paste({ replace: "/items/0/name" });
    });

    expect(failed?.ok).toBe(false);
    expect(hook.current.value).toEqual(initial);
    expect(hook.current.clipboard.read()).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
  });
});

describe("useJSONDocument can* checks", () => {
  test("exposes the same dry-run guard as the headless facade", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, { history: 10 }));

    let failed: ReturnType<typeof hook.current.canReplace> | undefined;
    act(() => {
      failed = hook.current.canReplace("/items/0/name", 1);
    });

    expect(failed).toMatchObject({ ok: false, code: "schema_violation" });
    expect(hook.current.value).toEqual(initial);
    expect(hook.current.history.undoDepth).toBe(0);
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
