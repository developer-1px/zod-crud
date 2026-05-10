// P5 — Clipboard verbs 단위 테스트.
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { copy } from "../src/verbs/copy.js";
import { cut } from "../src/verbs/cut.js";
import { paste } from "../src/verbs/paste.js";
import { duplicate } from "../src/verbs/duplicate.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
  meta: z.record(z.string(), z.string()),
});

const initial = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { foo: "bar" },
};

describe("verbs/copy", () => {
  test("source 값을 deep-cloned payload 로 추출 + state 불변", () => {
    const r = copy(initial, "/items/0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({ id: "a", name: "A" });
    expect(r.payload).not.toBe(initial.items[0]); // deep clone
    expect(initial.items.length).toBe(2); // unchanged
  });

  test("path_not_found 시 ok: false", () => {
    const r = copy(initial, "/items/99");
    expect(r.ok).toBe(false);
  });
});

describe("verbs/cut", () => {
  test("payload + remove patch atomic", () => {
    const r = cut(Schema, initial, "/items/0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({ id: "a", name: "A" });
    expect(r.next.items).toEqual([{ id: "b", name: "B" }]);
    expect(r.patch).toEqual([{ op: "remove", path: "/items/0" }]);
  });

  test("schema 위반 시 둘 다 안 일어남 (preFlight gate)", () => {
    const NonEmpty = z.object({ items: z.array(z.string()).min(2) });
    const r = cut(NonEmpty, { items: ["a", "b"] }, "/items/0");
    expect(r.ok).toBe(false); // 1개 남으면 min(2) 위반
  });
});

describe("verbs/paste", () => {
  test("into mode 가 RFC 6902 add 로 환원", () => {
    const r = paste(Schema, initial, { id: "c", name: "C" }, "/items/-", "into");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items).toHaveLength(3);
    expect(r.next.items[2]).toEqual({ id: "c", name: "C" });
  });

  test("after mode 가 다음 인덱스로 add", () => {
    const r = paste(Schema, initial, { id: "x", name: "X" }, "/items/0", "after");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items[1]).toEqual({ id: "x", name: "X" });
  });

  test("replace mode 가 RFC 6902 replace", () => {
    const r = paste(Schema, initial, { id: "z", name: "Z" }, "/items/0", "replace");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items[0]).toEqual({ id: "z", name: "Z" });
  });
});

describe("verbs/duplicate", () => {
  test("배열 source 는 다음 인덱스로 자동 복제", () => {
    const r = duplicate(Schema, initial, "/items/0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items).toHaveLength(3);
    expect(r.next.items[1]).toEqual({ id: "a", name: "A" });
    expect(r.duplicatedTo).toBe("/items/1");
  });

  test("object source 는 newKey 필수", () => {
    const r = duplicate(Schema, initial, "/meta/foo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_new_key");
  });

  test("object newKey 명시 시 RFC 6902 copy 로 환원", () => {
    const r = duplicate(Schema, initial, "/meta/foo", { newKey: "baz" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.meta.baz).toBe("bar");
    expect(r.duplicatedTo).toBe("/meta/baz");
  });

  test("newKey 충돌 시 거부", () => {
    const r = duplicate(Schema, { ...initial, meta: { foo: "bar", baz: "x" } }, "/meta/foo", {
      newKey: "baz",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("key_conflict");
  });
});
