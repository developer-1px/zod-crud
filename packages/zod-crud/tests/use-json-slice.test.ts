// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import { useJSON } from "../src/hooks/useJSON.js";
import { useJSONSlice } from "../src/hooks/useJSONSlice.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({
  meta: z.object({
    title: z.string(),
  }),
});

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useJSONSlice", () => {
  test("invalid pointer returns undefined instead of throwing during render", () => {
    const hook = renderHook(() => {
      const [, ops] = useJSON(Schema, { meta: { title: "Title" } });
      return useJSONSlice(ops, "meta/title");
    });

    expect(hook.current).toBeUndefined();
  });

  test("malformed URI fragment pointer returns undefined instead of throwing during render", () => {
    const hook = renderHook(() => {
      const [, ops] = useJSON(Schema, { meta: { title: "Title" } });
      return useJSONSlice(ops, "#/%E0%A4%A");
    });

    expect(hook.current).toBeUndefined();
  });
});

function renderHook<T>(hook: () => T): { readonly current: T } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  const result: { current?: T; rendered: boolean } = { rendered: false };
  function Component() {
    result.current = hook();
    result.rendered = true;
    return null;
  }

  act(() => {
    root.render(createElement(Component));
  });

  return {
    get current() {
      if (!result.rendered) throw new Error("hook did not render");
      return result.current as T;
    },
  };
}
