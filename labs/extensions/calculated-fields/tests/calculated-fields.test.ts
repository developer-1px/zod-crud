import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  createCalculatedFields,
  planCalculatedFields,
  syncCalculatedFields,
  type CalculatedFieldDefinition,
} from "../src/index.js";

const Item = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Schema = z.object({
  title: z.string(),
  slug: z.string(),
  items: z.array(Item),
  stats: z.object({
    total: z.number().int().min(0),
    done: z.number().int().min(0),
  }),
});

type DocumentValue = z.output<typeof Schema>;

function createDoc() {
  return createJSONDocument(Schema, {
    title: "My Board",
    slug: "",
    items: [
      { id: "a", title: "A", done: true },
      { id: "b", title: "B", done: false },
    ],
    stats: {
      total: 0,
      done: 0,
    },
  });
}

const fields: Array<CalculatedFieldDefinition<DocumentValue>> = [
  {
    key: "slug",
    path: "/slug",
    compute: ({ value }) => value.title.toLowerCase().replace(/\s+/g, "-"),
  },
  {
    key: "total",
    path: "/stats/total",
    compute: ({ value }) => value.items.length,
  },
  {
    key: "done",
    path: "/stats/done",
    compute: ({ value }) => value.items.filter((item) => item.done).length,
  },
];

describe("@interactive-os/json-document-calculated-fields", () => {
  test("plans calculated field replacements without mutating", () => {
    const doc = createDoc();

    expect(planCalculatedFields(doc, fields)).toMatchObject({
      ok: true,
      changed: true,
      fields: [
        {
          key: "slug",
          path: "/slug",
          current: "",
          computed: "my-board",
          changed: true,
        },
        {
          key: "total",
          path: "/stats/total",
          current: 0,
          computed: 2,
          changed: true,
        },
        {
          key: "done",
          path: "/stats/done",
          current: 0,
          computed: 1,
          changed: true,
        },
      ],
      operations: [
        { op: "replace", path: "/slug", value: "my-board" },
        { op: "replace", path: "/stats/total", value: 2 },
        { op: "replace", path: "/stats/done", value: 1 },
      ],
    });
    expect(doc.value.stats.total).toBe(0);
  });

  test("syncs calculated fields through patch", () => {
    const doc = createDoc();
    const computed = createCalculatedFields(doc, fields);

    expect(computed.canSync()).toMatchObject({ ok: true, changed: true });
    expect(computed.sync()).toMatchObject({ ok: true, changed: true });
    expect(doc.value).toMatchObject({
      slug: "my-board",
      stats: {
        total: 2,
        done: 1,
      },
    });
  });

  test("returns unchanged when computed values are already current", () => {
    const doc = createDoc();

    syncCalculatedFields(doc, fields);

    expect(planCalculatedFields(doc, fields)).toEqual({
      ok: true,
      changed: false,
      fields: [
        {
          key: "slug",
          path: "/slug",
          current: "my-board",
          computed: "my-board",
          changed: false,
          operation: null,
        },
        {
          key: "total",
          path: "/stats/total",
          current: 2,
          computed: 2,
          changed: false,
          operation: null,
        },
        {
          key: "done",
          path: "/stats/done",
          current: 1,
          computed: 1,
          changed: false,
          operation: null,
        },
      ],
      operations: [],
    });
  });

  test("reports missing target paths", () => {
    const doc = createDoc();

    expect(planCalculatedFields(doc, [
      {
        path: "/missing",
        compute: () => "x",
      },
    ])).toMatchObject({
      ok: false,
      code: "read_failed",
      key: "/missing",
      pointer: "/missing",
    });
  });

  test("reports compute failures", () => {
    const doc = createDoc();

    expect(planCalculatedFields(doc, [
      {
        key: "broken",
        path: "/slug",
        compute: () => {
          throw new Error("formula failed");
        },
      },
    ])).toEqual({
      ok: false,
      code: "compute_failed",
      reason: "formula failed",
      key: "broken",
      pointer: "/slug",
    });
  });

  test("reports schema rejections for computed values", () => {
    const doc = createDoc();

    expect(planCalculatedFields(doc, [
      {
        key: "total",
        path: "/stats/total",
        compute: () => "two",
      },
    ])).toMatchObject({
      ok: false,
      code: "value_rejected",
      key: "total",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.stats.total).toBe(0);
  });

  test("lets formulas read through public document helpers", () => {
    const doc = createDoc();

    expect(planCalculatedFields(doc, [
      {
        key: "first-title",
        path: "/slug",
        compute: ({ at }) => {
          const read = at("/items/0/title");
          return read.ok ? read.value : "missing";
        },
      },
    ])).toMatchObject({
      ok: true,
      operations: [
        { op: "replace", path: "/slug", value: "A" },
      ],
    });
  });

  test("returns isolated computed plans", () => {
    const doc = createDoc();
    const plan = planCalculatedFields(doc, fields);
    if (!plan.ok) throw new Error(plan.reason);

    const operation = plan.operations[0];
    if (operation?.op !== "replace") throw new Error("expected replace");
    operation.value = "mutated";
    plan.fields[0]!.computed = "mutated";

    const next = planCalculatedFields(doc, fields);
    if (!next.ok) throw new Error(next.reason);
    expect(next.fields[0]).toMatchObject({ key: "slug", computed: "my-board" });
    expect(next.operations[0]).toEqual({ op: "replace", path: "/slug", value: "my-board" });
    expect(doc.value.slug).toBe("");
  });
});
