// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { z } from "zod";

import { useJSONDocument } from "../src/hooks/useJSONDocument.js";
import { useDebugLog } from "../src/sidecars/debug-log.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const Schema = z.object({
  title: z.string(),
  nested: z.object({ count: z.number() }),
});

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("useDebugLog", () => {
  test("custom event data 와 initialState 를 기록 시점 JSON snapshot 으로 고정한다", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.debug.start();
    });

    const payload = { nested: { count: 1 } };
    act(() => {
      hook.current.debug.log("custom", payload);
    });
    payload.nested.count = 9;

    let log: ReturnType<typeof hook.current.debug.stop> | undefined;
    act(() => {
      log = hook.current.debug.stop();
    });
    hook.current.doc.value.nested.count = 7;

    expect(log?.initialState).toEqual({ title: "A", nested: { count: 0 } });
    expect(log?.events[0]?.data).toEqual({ nested: { count: 1 } });
  });

  test("commit before/after 도 이후 state mutation 과 alias 되지 않는다", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.debug.start();
    });
    act(() => {
      hook.current.doc.ops.replace("/nested/count", 1);
    });

    let log: ReturnType<typeof hook.current.debug.stop> | undefined;
    act(() => {
      log = hook.current.debug.stop();
    });
    const commit = log?.events.find((event) => event.kind === "commit");
    hook.current.doc.value.nested.count = 99;

    expect(commit?.data?.before).toEqual({ title: "A", nested: { count: 0 } });
    expect(commit?.data?.after).toEqual({ title: "A", nested: { count: 1 } });
  });

  test("비JSON data 는 다운로드 가능한 로그에 들어가기 전에 거부한다", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.debug.start();
    });

    expect(() => {
      act(() => {
        hook.current.debug.log("custom", { bad: undefined });
      });
    }).toThrow(TypeError);
  });

  test("stop 이후 manual log 를 무시하고 다시 start 할 수 있다", () => {
    const hook = renderHook(() => useHarness());

    act(() => {
      hook.current.debug.start();
      hook.current.debug.log("first");
    });

    let first: ReturnType<typeof hook.current.debug.stop> | undefined;
    act(() => {
      first = hook.current.debug.stop();
    });
    act(() => {
      hook.current.debug.log("after-stop");
    });
    expect(hook.current.debug.events.map((event) => event.kind)).toEqual(["first"]);

    act(() => {
      hook.current.debug.start();
      hook.current.debug.log("second");
    });
    let second: ReturnType<typeof hook.current.debug.stop> | undefined;
    act(() => {
      second = hook.current.debug.stop();
    });

    expect(first?.events.map((event) => event.kind)).toEqual(["first"]);
    expect(second?.events.map((event) => event.kind)).toEqual(["second"]);
  });
});

function useHarness() {
  const doc = useJSONDocument(Schema, { title: "A", nested: { count: 0 } });
  const debug = useDebugLog(doc.ops);
  return { doc, debug };
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
