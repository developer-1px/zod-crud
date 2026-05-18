// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import { useJSONDocument } from "../src/hooks/useJSONDocument.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({ name: z.string() });
const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useJSONDocument ops.load history", () => {
  test("load keeps existing history only when preserveHistory is true", () => {
    const hook = renderHook(() => useJSONDocument(Schema, { name: "a" }, { history: 10 }));

    act(() => {
      hook.current.ops.replace("/name", "b");
    });
    expect(hook.current.history.canUndo).toBe(true);

    act(() => {
      hook.current.ops.load({ name: "c" }, { preserveHistory: true });
    });
    expect(hook.current.history.canUndo).toBe(true);

    act(() => {
      hook.current.ops.load({ name: "d" });
    });
    expect(hook.current.history.canUndo).toBe(false);
  });

  test("failed load preserves existing history", () => {
    const hook = renderHook(() => useJSONDocument(Schema, { name: "a" }, { history: 10, strict: false }));

    act(() => {
      hook.current.ops.replace("/name", "b");
    });
    expect(hook.current.history.canUndo).toBe(true);

    let result: ReturnType<typeof hook.current.ops.load> | undefined;
    act(() => {
      result = hook.current.ops.load({ name: 1 } as unknown as { name: string });
    });

    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(JSON.parse(result.reason ?? "")[0]?.path).toEqual(["name"]);
    }
    expect(hook.current.value).toEqual({ name: "b" });
    expect(hook.current.history.canUndo).toBe(true);
  });

  test("failed reset preserves existing history", () => {
    const hook = renderHook(() => useJSONDocument(Schema, { name: "a" }, { history: 10, strict: false }));

    act(() => {
      hook.current.ops.replace("/name", "b");
    });
    expect(hook.current.history.canUndo).toBe(true);

    let result: ReturnType<typeof hook.current.ops.reset> | undefined;
    act(() => {
      result = hook.current.ops.reset({ name: 1 } as unknown as { name: string });
    });

    expect(result?.ok).toBe(false);
    if (result && !result.ok) {
      expect(JSON.parse(result.reason ?? "")[0]?.path).toEqual(["name"]);
    }
    expect(hook.current.value).toEqual({ name: "b" });
    expect(hook.current.history.canUndo).toBe(true);
  });

  test("set returns invalid_pointer through the error policy", () => {
    const onError = vi.fn();
    const hook = renderHook(() => useJSONDocument(Schema, { name: "a" }, { strict: false, onError }));

    let result: ReturnType<typeof hook.current.ops.set> | undefined;
    act(() => {
      result = hook.current.ops.set("name" as never, "b" as never);
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_pointer", pointer: "name" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      name: "JSONCrudError",
      op: "set",
      result: { ok: false, code: "invalid_pointer", pointer: "name" },
    });
    expect(hook.current.value).toEqual({ name: "a" });
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
