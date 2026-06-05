// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import { useJSONDocument } from "zod-crud/react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  title: "draft",
  tasks: [
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

describe("useJSONDocument read/query facade", () => {
  test("matches the headless read helpers and updates after edits", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial, { history: 10 }));

    expect(hook.current.at("/title")).toEqual({ ok: true, path: "/title", value: "draft" });
    expect(hook.current.exists("/tasks/1")).toBe(true);
    expect(hook.current.query("$.tasks[*].id")).toEqual({
      ok: true,
      query: "$.tasks[*].id",
      pointers: ["/tasks/0/id", "/tasks/1/id"],
    });
    expect(hook.current.entries("/tasks")).toMatchObject({ ok: true, kind: "array" });

    act(() => {
      hook.current.patch({ op: "replace", path: "/title", value: "final" });
    });

    expect(hook.current.at("/title")).toEqual({ ok: true, path: "/title", value: "final" });
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
