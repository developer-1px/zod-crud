// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { z } from "zod";

import { useJSONDocument } from "../src/hooks/useJSONDocument.js";
import { useRecorder } from "../src/sidecars/recorder.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({
  nested: z.object({ count: z.number() }),
});

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useRecorder", () => {
  test("initial 과 recorded op value 를 기록 시점 JSON snapshot 으로 고정한다", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.recorder.start();
    });

    hook.current.doc.value.nested.count = 7;
    const next = { count: 1 };
    act(() => {
      hook.current.doc.ops.replace("/nested", next);
    });
    next.count = 9;

    let recording: ReturnType<typeof hook.current.recorder.stop> | undefined;
    act(() => {
      recording = hook.current.recorder.stop();
    });
    hook.current.doc.value.nested.count = 99;

    expect(recording?.initial).toEqual({ nested: { count: 0 } });
    expect(recording?.steps[0]?.ops[0]).toEqual({ op: "replace", path: "/nested", value: { count: 1 } });
  });

  test("stop 이후 기록하지 않고 다시 start 할 수 있다", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.recorder.start();
    });
    act(() => {
      hook.current.doc.ops.replace("/nested/count", 1);
    });

    let first: ReturnType<typeof hook.current.recorder.stop> | undefined;
    act(() => {
      first = hook.current.recorder.stop();
    });
    act(() => {
      hook.current.doc.ops.replace("/nested/count", 2);
    });

    act(() => {
      hook.current.recorder.start();
    });
    act(() => {
      hook.current.doc.ops.replace("/nested/count", 3);
    });
    let second: ReturnType<typeof hook.current.recorder.stop> | undefined;
    act(() => {
      second = hook.current.recorder.stop();
    });

    expect(first?.steps).toHaveLength(1);
    expect(second?.steps).toHaveLength(1);
    expect(second?.steps[0]?.ops[0]).toEqual({ op: "replace", path: "/nested/count", value: 3 });
  });
});

function useHarness() {
  const doc = useJSONDocument(Schema, { nested: { count: 0 } });
  const recorder = useRecorder(doc.ops);
  return { doc, recorder };
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
