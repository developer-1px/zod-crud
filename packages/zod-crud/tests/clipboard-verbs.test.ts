// P5 — Clipboard verbs 단위 테스트.
import { afterEach, describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { copy, toClipboardItems, toMarkdown, toTsv } from "../src/verbs/copy.js";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  test("non-JSON source 는 payload 손실 없이 거부", () => {
    const r = copy({ item: { id: "a", dropped: undefined } }, "/item");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_serializable");
  });

  test("schema field order 로 TSV clipboard representation 생성", () => {
    const payload = [
      { name: "A", id: "a" },
      { name: "B", id: "b" },
    ];
    expect(toTsv(payload, Schema.shape.items)).toBe("id\tname\na\tA\nb\tB");
  });

  test("clipboard item map 은 JSON + plain text TSV + optional HTML 을 함께 제공", () => {
    const payload = [{ id: "a", name: "A" }];
    const items = toClipboardItems(payload, Schema.shape.items, {
      json: true,
      tsv: true,
      html: () => "<table></table>",
    });
    expect(items["application/json"]).toBe(JSON.stringify(payload));
    expect(items["text/plain"]).toBe("id\tname\na\tA");
    expect(items["text/tab-separated-values"]).toBe("id\tname\na\tA");
    expect(items["text/html"]).toBe("<table></table>");
  });

  test("clipboard item map rejects non-JSON payloads", () => {
    expect(() => toClipboardItems({ id: "a", dropped: undefined }, Schema.shape.items)).toThrow(TypeError);
  });

  test("markdown table helper 도 schema field order 를 따른다", () => {
    expect(toMarkdown([{ name: "A", id: "a" }], Schema.shape.items)).toBe("| id | name |\n| --- | --- |\n| a | A |");
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

  test("non-JSON payload 는 cut 전에 거부", () => {
    const Loose = z.object({ items: z.array(z.any()) });
    const state = { items: [{ id: "a", dropped: undefined }] };
    const r = cut(Loose, state, "/items/0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_serializable");
    expect(state.items).toHaveLength(1);
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

  test("discriminated union branch mismatch 는 structured code 로 거부", () => {
    const Section = z.discriminatedUnion("type", [
      z.object({ type: z.literal("hero"), title: z.string() }),
      z.object({ type: z.literal("features"), items: z.array(z.string()) }),
    ]);
    const Page = z.object({
      hero: Section,
      features: z.object({ type: z.literal("features"), items: z.array(z.string()) }),
    });
    const state = {
      hero: { type: "hero", title: "Hi" },
      features: { type: "features", items: [] },
    };

    const r = paste(Page, state, { type: "hero", title: "Wrong" }, "/features", "replace");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("du_branch_mismatch");
    if (r.code !== "du_branch_mismatch") return;
    expect(r.source).toEqual({ discriminator: "type", value: "hero" });
    expect(r.expected).toEqual({ discriminator: "type", allowed: ["features"] });
  });

  test("invalid target pointer is handled by preFlight, not schema introspection throw", () => {
    const r = paste(Schema, initial, { id: "c", name: "C" }, "items/0" as never, "replace");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("invalid_pointer");
    }
  });

  test("rekey option rewrites colliding payload fields before preFlight", () => {
    const r = paste(Schema, initial, { id: "a", name: "A copy" }, "/items/-", "into", {
      rekey: { fields: ["id"], strategy: "suffix" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items[2]).toEqual({ id: "a-copy", name: "A copy" });
    expect(r.patch).toEqual([{ op: "add", path: "/items/-", value: { id: "a-copy", name: "A copy" } }]);
  });

  test("rekey refuses non-JSON payloads before cloning can drop fields", () => {
    const r = paste(Schema, initial, { id: "a", name: "A copy", dropped: undefined }, "/items/-", "into", {
      rekey: { fields: ["id"], strategy: "suffix" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_serializable");
  });

  test("uuid rekey uses crypto.getRandomValues fallback without Math.random", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0x11);
        return bytes;
      },
    });
    const mathRandom = vi.spyOn(Math, "random");

    const r = paste(Schema, initial, { id: "a", name: "A copy" }, "/items/-", "into", {
      rekey: { fields: ["id"], strategy: "uuid" },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items[2]).toEqual({ id: "11111111-1111-4111-9111-111111111111", name: "A copy" });
    expect(mathRandom).not.toHaveBeenCalled();
  });

  test("uuid rekey returns structured error when Web Crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    const r = paste(Schema, initial, { id: "a", name: "A copy" }, "/items/-", "into", {
      rekey: { fields: ["id"], strategy: "uuid" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("rekey_failed");
      expect(r.message).toContain("crypto.getRandomValues is required");
    }
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

  test("rekey option rewrites duplicated array item collisions", () => {
    const r = duplicate(Schema, initial, "/items/0", {
      rekey: { fields: ["id"], strategy: "suffix" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items[1]).toEqual({ id: "a-copy", name: "A" });
    expect(r.patch).toEqual([{ op: "add", path: "/items/1", value: { id: "a-copy", name: "A" } }]);
  });

  test("rekey errors are structured for duplicate", () => {
    vi.stubGlobal("crypto", undefined);
    const r = duplicate(Schema, initial, "/items/0", {
      rekey: { fields: ["id"], strategy: "uuid" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("rekey_failed");
  });
});
