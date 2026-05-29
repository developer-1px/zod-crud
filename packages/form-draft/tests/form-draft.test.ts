import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  createFormDraft,
  type FormDraftParser,
  type FormDraftParseResult,
} from "../src/index.js";

const Schema = z.object({
  title: z.string().min(1),
  count: z.number().int().min(0),
});

const UnionSchema = z.object({
  blocks: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string() }),
    z.object({ kind: z.literal("link"), label: z.string(), href: z.string().url() }),
  ])),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    count: 1,
  }, { history: 20 });
}

function createUnionDoc() {
  return createJSONDocument(UnionSchema, {
    blocks: [
      { kind: "text", text: "Body" },
      { kind: "link", label: "Docs", href: "https://example.com/docs" },
    ],
  });
}

const parseNumber: FormDraftParser<string> = ({ input }) => {
  return parseNumberInput(input);
};

function parseNumberInput(input: string): FormDraftParseResult {
  if (input.trim() === "") return { ok: false, reason: "empty number" };
  const value = Number(input);
  return Number.isFinite(value)
    ? { ok: true, value }
    : { ok: false, reason: "not a number" };
}

const parseFormInput: FormDraftParser<string> = ({ input, kind }) => {
  if (kind !== "number") return { ok: true, value: input };
  return parseNumberInput(input);
};

describe("@zod-crud/form-draft", () => {
  test("holds a valid draft without mutating document state", () => {
    const doc = createDoc();
    const drafts = createFormDraft(doc, { parse: parseNumber });

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
    const drafts = createFormDraft(doc, { parse: parseNumber });

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
    const drafts = createFormDraft(doc, { parse: parseNumber });

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

  test("falls back to canReplace for discriminated-union branch fields", () => {
    const doc = createUnionDoc();
    const drafts = createFormDraft(doc);

    expect(drafts.set("/blocks/0/text", "Updated")).toMatchObject({
      ok: true,
      snapshot: {
        kind: "string",
        valid: true,
        capability: { ok: true },
      },
    });
    expect(drafts.commit("/blocks/0/text")).toMatchObject({
      ok: true,
      snapshot: {
        currentValue: "Updated",
        dirty: false,
      },
    });

    expect(drafts.set("/blocks/1/href", "not-a-url")).toMatchObject({
      ok: true,
      snapshot: {
        kind: "string",
        valid: false,
        error: {
          code: "value_rejected",
          capability: {
            code: "schema_violation",
          },
        },
      },
    });
    expect(doc.at("/blocks/1/href")).toEqual({
      ok: true,
      path: "/blocks/1/href",
      value: "https://example.com/docs",
    });
  });

  test("commits valid drafts through document replace", () => {
    const doc = createDoc();
    const drafts = createFormDraft(doc, { parse: parseNumber });

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

  test("commits multiple form drafts as one patch batch", () => {
    const doc = createDoc();
    const drafts = createFormDraft(doc, { parse: parseFormInput });

    drafts.set("/title", "Final");
    drafts.set("/count", "4");

    expect(drafts.currentAll().map((snapshot) => snapshot.pointer)).toEqual(["/count", "/title"]);
    expect(drafts.canCommitAll()).toMatchObject({
      ok: true,
      root: "",
      operations: [
        { op: "replace", path: "/count", value: 4 },
        { op: "replace", path: "/title", value: "Final" },
      ],
    });
    expect(doc.value).toEqual({ title: "Draft", count: 1 });

    expect(drafts.commitAll()).toMatchObject({
      ok: true,
      root: "",
      result: { ok: true },
      snapshots: [
        { pointer: "/count", currentValue: 4, dirty: false },
        { pointer: "/title", currentValue: "Final", dirty: false },
      ],
    });
    expect(doc.lastPatch).toEqual([
      { op: "replace", path: "/count", value: 4 },
      { op: "replace", path: "/title", value: "Final" },
    ]);
    expect(doc.history.undoDepth).toBe(1);
    expect(drafts.currentAll()).toEqual([]);

    expect(doc.history.undo()).toBe(true);
    expect(doc.value).toEqual({ title: "Draft", count: 1 });
  });

  test("blocks form batch commit when any draft is invalid", () => {
    const doc = createDoc();
    const drafts = createFormDraft(doc, { parse: parseFormInput });

    drafts.set("/title", "Final");
    drafts.set("/count", "bad");

    expect(drafts.currentAll()).toHaveLength(2);
    expect(drafts.canCommitAll()).toMatchObject({
      ok: false,
      code: "parse_failed",
      pointer: "/count",
    });
    expect(drafts.commitAll()).toMatchObject({
      ok: false,
      code: "parse_failed",
      pointer: "/count",
    });
    expect(doc.value).toEqual({ title: "Draft", count: 1 });
    expect(doc.lastPatch).toEqual([]);
  });

  test("uses identity parser by default", () => {
    const doc = createDoc();
    const drafts = createFormDraft(doc);

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
    const drafts = createFormDraft(doc);

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
    const drafts = createFormDraft(doc);
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
    const drafts = createFormDraft(doc);

    drafts.set("/title", "Next");
    expect(drafts.reset("/title")).toBe(true);
    expect(drafts.current("/title")).toBeNull();

    drafts.set("/title", "Again");
    drafts.clear();
    expect(drafts.current("/title")).toBeNull();
  });
});
