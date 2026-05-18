// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as z from "zod";

import { useDraft } from "../src/hooks/useDraft.js";
import { useJSONDocument } from "../src/hooks/useJSONDocument.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  meta: z.object({
    label: z.string().min(3),
  }),
});

type HookResult = ReturnType<typeof useHarness>;

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useDraft", () => {
  test("invalid set keeps attempted value without changing committed document", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.draft.field("/slug").set("");
    });

    const field = hook.current.draft.field("/slug");
    expect(field.value).toBe("");
    expect(field.committed).toBe("foo");
    expect(field.pending).toBe(true);
    expect(field.error?.ok).toBe(false);
    expect(hook.current.doc.value.slug).toBe("foo");
    expect(hook.current.draft.pending).toBe(true);
    expect(hook.current.draft.canSave).toBe(false);
  });

  test("invalid object attempts are snapshotted", () => {
    const hook = renderHook(() => useHarness());
    const attempted = { label: "x" };

    act(() => {
      hook.current.draft.field("/meta").set(attempted);
    });
    attempted.label = "mutated";

    expect(hook.current.draft.field("/meta").value).toEqual({ label: "x" });
    expect(hook.current.doc.value.meta).toEqual({ label: "Old" });
  });

  test("valid set commits, clears pending, and markSaved refreshes dirty baseline", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.draft.field("/slug").set("bar");
    });

    expect(hook.current.doc.value.slug).toBe("bar");
    expect(hook.current.draft.field("/slug").pending).toBe(false);
    expect(hook.current.draft.dirty).toBe(true);
    expect(hook.current.draft.canSave).toBe(true);

    act(() => {
      hook.current.draft.markSaved();
    });

    expect(hook.current.draft.dirty).toBe(false);
    expect(hook.current.draft.canSave).toBe(false);
  });

  test("discardAttempt drops invalid UI value, resetToBaseline reverts committed changes", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.draft.field("/slug").set("");
    });
    act(() => {
      hook.current.draft.field("/slug").discardAttempt();
    });

    expect(hook.current.draft.field("/slug").value).toBe("foo");
    expect(hook.current.draft.pending).toBe(false);

    act(() => {
      hook.current.draft.field("/title").set("Renamed");
    });
    expect(hook.current.doc.value.title).toBe("Renamed");

    act(() => {
      hook.current.draft.resetToBaseline();
    });

    expect(hook.current.doc.value).toEqual({ slug: "foo", title: "Title", meta: { label: "Old" } });
    expect(hook.current.draft.dirty).toBe(false);
  });
});

function useHarness() {
  const doc = useJSONDocument(Schema, { slug: "foo", title: "Title", meta: { label: "Old" } }, { history: 10 });
  const draft = useDraft(doc);
  return { doc, draft };
}

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

void (undefined as unknown as HookResult);
