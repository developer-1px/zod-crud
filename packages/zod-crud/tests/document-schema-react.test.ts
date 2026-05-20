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
  title: z.string().min(1),
  items: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

const initial: z.output<typeof Schema> = {
  title: "draft",
  items: [{ id: "a", done: false }],
};

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useJSONDocument doc.schema", () => {
  test("exposes the same serializable schema facade as headless documents", () => {
    const hook = renderHook(() => useJSONDocument(Schema, initial));

    expect(hook.current.schema.kind("/items", "insert")).toEqual({
      ok: true,
      path: "/items",
      mode: "insert",
      kind: "object",
    });
    expect(hook.current.schema.accepts("/title", 1)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(hook.current.value).toEqual(initial);
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
