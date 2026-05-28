import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  createFieldDraft,
  type FieldDraftParser,
} from "../src/index.js";

const Schema = z.object({
  title: z.string().min(1),
  count: z.number().int().min(0),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    count: 1,
  });
}

const parseNumber: FieldDraftParser<string> = ({ input }) => {
  if (input.trim() === "") return { ok: false, reason: "empty number" };
  const value = Number(input);
  return Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false, reason: "not a number" };
};

describe("@zod-crud/field-draft", () => {
  test("holds a valid draft without mutating document state", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc, { parse: parseNumber });

    expect(drafts.set("/count", "2")).toMatchObject({
      ok: true,
      snapshot: {
        pointer: "/count",
        input: "2",
        currentValue: 1,
        kind: "number",
        parsed: 2,
        valid: true,
        dirty: true,
        capability: { ok: true },
      },
    });
    expect(doc.value.count).toBe(1);
  });

  test("keeps parse failures outside the document", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc, { parse: parseNumber });

    expect(drafts.set("/count", "abc")).toMatchObject({
      ok: true,
      snapshot: {
        valid: false,
        dirty: true,
        error: {
          ok: false,
          code: "parse_failed",
          reason: "not a number",
          pointer: "/count",
        },
      },
    });
    expect(drafts.canCommit("/count")).toMatchObject({
      ok: false,
      code: "parse_failed",
    });
    expect(doc.value.count).toBe(1);
  });

  test("reports schema rejection for parsed values", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc, { parse: parseNumber });

    expect(drafts.set("/count", "-1")).toMatchObject({
      ok: true,
      snapshot: {
        valid: false,
        parsed: -1,
        error: {
          ok: false,
          code: "value_rejected",
          capability: {
            ok: false,
            code: "schema_violation",
          },
        },
      },
    });
    expect(doc.value.count).toBe(1);
  });

  test("commits valid drafts through document replace", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc, { parse: parseNumber });

    drafts.set("/count", "3");

    expect(drafts.commit("/count")).toMatchObject({
      ok: true,
      snapshot: {
        pointer: "/count",
        currentValue: 3,
        valid: true,
        dirty: false,
      },
      result: { ok: true },
    });
    expect(doc.value.count).toBe(3);
    expect(drafts.current("/count")).toBeNull();
  });

  test("uses identity parser by default", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc);

    drafts.set("/title", "Next");

    expect(drafts.canCommit("/title")).toEqual({ ok: true });
    expect(drafts.commit("/title")).toMatchObject({
      ok: true,
      snapshot: {
        currentValue: "Next",
        dirty: false,
      },
    });
    expect(doc.value.title).toBe("Next");
  });

  test("reports missing and invalid draft paths", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc);

    expect(drafts.set("/missing", "x")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
    expect(drafts.set("title", "x")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "title",
    });
    expect(drafts.commit("/title")).toEqual({
      ok: false,
      code: "missing_draft",
      reason: "draft not found: /title",
      pointer: "/title",
    });
  });

  test("emits isolated snapshots", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc);
    const events: unknown[] = [];

    drafts.subscribe((snapshot) => events.push(snapshot));
    const set = drafts.set("/title", "Next");
    if (!set.ok) throw new Error(set.reason);
    set.snapshot.input = "Mutated";

    expect(events).toEqual([
      {
        pointer: "/title",
        input: "Next",
        currentValue: "Draft",
        kind: "string",
        parsed: "Next",
        valid: true,
        dirty: true,
        error: null,
        capability: { ok: true },
      },
    ]);
    expect(drafts.current("/title")).toMatchObject({
      input: "Next",
      parsed: "Next",
    });
  });

  test("reset and clear remove draft state", () => {
    const doc = createDoc();
    const drafts = createFieldDraft(doc);

    drafts.set("/title", "Next");
    expect(drafts.reset("/title")).toBe(true);
    expect(drafts.current("/title")).toBeNull();

    drafts.set("/title", "Again");
    drafts.clear();
    expect(drafts.current("/title")).toBeNull();
  });
});
