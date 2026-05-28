import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createSchemaForm } from "../src/index.js";

const Settings = z.object({
  title: z.string(),
  published: z.boolean(),
  count: z.number().int(),
  status: z.enum(["draft", "live"]),
  tags: z.array(z.string()),
  meta: z.object({
    owner: z.string(),
  }),
  resources: z.record(z.string(), z.object({
    label: z.string(),
    enabled: z.boolean(),
  })),
});

function createSettingsDoc() {
  return createJSONDocument(Settings, {
    title: "Draft",
    published: false,
    count: 1,
    status: "draft",
    tags: ["alpha", "beta"],
    meta: {
      owner: "Ada",
    },
    resources: {
      pages: { label: "Pages", enabled: true },
      posts: { label: "Posts", enabled: false },
    },
  }, {
    history: 20,
  });
}

describe("@zod-crud/schema-form", () => {
  test("reads root object entries as field descriptors", () => {
    const doc = createSettingsDoc();

    const form = createSchemaForm(doc);

    expect(form).toMatchObject({
      ok: true,
      path: "",
      kind: "object",
    });
    if (!form.ok) throw new Error(form.reason);

    expect(form.fields.map((field) => ({
      key: field.key,
      path: field.path,
      value: field.value,
      kind: field.kind,
    }))).toEqual([
      { key: "title", path: "/title", value: "Draft", kind: "string" },
      { key: "published", path: "/published", value: false, kind: "boolean" },
      { key: "count", path: "/count", value: 1, kind: "number" },
      { key: "status", path: "/status", value: "draft", kind: "enum" },
      { key: "tags", path: "/tags", value: ["alpha", "beta"], kind: "array" },
      { key: "meta", path: "/meta", value: { owner: "Ada" }, kind: "object" },
      {
        key: "resources",
        path: "/resources",
        value: {
          pages: { label: "Pages", enabled: true },
          posts: { label: "Posts", enabled: false },
        },
        kind: "record",
      },
    ]);
    expect(form.fields.every((field) => field.canReplace.ok)).toBe(true);
  });

  test("sets a field with replace patching", () => {
    const doc = createSettingsDoc();
    const form = createSchemaForm(doc);
    if (!form.ok) throw new Error(form.reason);

    const title = form.fields.find((field) => field.key === "title");
    if (!title) throw new Error("missing title field");

    expect(title.canSet("Published")).toEqual({ ok: true });
    expect(title.set("Published")).toEqual({ ok: true });
    expect(doc.value.title).toBe("Published");
    expect(doc.lastPatch).toEqual([
      { op: "replace", path: "/title", value: "Published" },
    ]);
  });

  test("checks schema and document capability before setting", () => {
    const doc = createSettingsDoc();
    const form = createSchemaForm(doc);
    if (!form.ok) throw new Error(form.reason);

    const count = form.fields.find((field) => field.key === "count");
    if (!count) throw new Error("missing count field");

    expect(count.canSet(2)).toEqual({ ok: true });
    expect(count.canSet("two")).toMatchObject({
      ok: false,
      code: "schema_violation",
      violations: [
        {
          path: "/count",
        },
      ],
    });
    expect(doc.value.count).toBe(1);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("reads array entries as field descriptors", () => {
    const doc = createSettingsDoc();

    const form = createSchemaForm(doc, "/tags");

    expect(form).toMatchObject({
      ok: true,
      path: "/tags",
      kind: "array",
    });
    if (!form.ok) throw new Error(form.reason);

    expect(form.fields.map((field) => ({
      key: field.key,
      path: field.path,
      value: field.value,
      kind: field.kind,
    }))).toEqual([
      { key: "0", path: "/tags/0", value: "alpha", kind: "string" },
      { key: "1", path: "/tags/1", value: "beta", kind: "string" },
    ]);

    expect(form.fields[1]?.set("stable")).toEqual({ ok: true });
    expect(doc.value.tags).toEqual(["alpha", "stable"]);
  });

  test("reads record entries as field descriptors", () => {
    const doc = createSettingsDoc();

    const form = createSchemaForm(doc, "/resources");

    expect(form).toMatchObject({
      ok: true,
      path: "/resources",
      kind: "record",
    });
    if (!form.ok) throw new Error(form.reason);

    expect(form.fields.map((field) => ({
      key: field.key,
      path: field.path,
      value: field.value,
      kind: field.kind,
    }))).toEqual([
      {
        key: "pages",
        path: "/resources/pages",
        value: { label: "Pages", enabled: true },
        kind: "object",
      },
      {
        key: "posts",
        path: "/resources/posts",
        value: { label: "Posts", enabled: false },
        kind: "object",
      },
    ]);
  });

  test("describes common editable property surfaces without product-specific API", () => {
    const Slide = z.object({
      settings: z.object({
        title: z.string(),
        visible: z.boolean(),
      }),
      tab: z.object({
        label: z.string(),
        color: z.string(),
      }),
    });
    const doc = createJSONDocument(Slide, {
      settings: { title: "Intro", visible: true },
      tab: { label: "Sheet 1", color: "blue" },
    }, { history: 10 });

    const settings = createSchemaForm(doc, "/settings");
    const tab = createSchemaForm(doc, "/tab");

    expect(settings).toMatchObject({
      ok: true,
      fields: [
        { key: "title", path: "/settings/title", kind: "string" },
        { key: "visible", path: "/settings/visible", kind: "boolean" },
      ],
    });
    expect(tab).toMatchObject({
      ok: true,
      fields: [
        { key: "label", path: "/tab/label", kind: "string" },
        { key: "color", path: "/tab/color", kind: "string" },
      ],
    });
  });

  test("snapshots field values instead of retaining live object references", () => {
    const doc = createSettingsDoc();
    const form = createSchemaForm(doc);
    if (!form.ok) throw new Error(form.reason);

    const meta = form.fields.find((field) => field.key === "meta");
    if (!meta || typeof meta.value !== "object" || meta.value === null) {
      throw new Error("missing meta field");
    }

    expect(doc.replace("/meta/owner", "Grace")).toEqual({ ok: true });
    expect(meta.value).toEqual({ owner: "Ada" });
  });

  test("reports non-container roots without mutating", () => {
    const doc = createSettingsDoc();

    const form = createSchemaForm(doc, "/title");

    expect(form).toMatchObject({
      ok: false,
      code: "not_container",
      pointer: "/title",
      kind: "string",
    });
    expect(doc.history.undoDepth).toBe(0);
  });

  test("forwards pointer errors from public entry reads", () => {
    const doc = createSettingsDoc();

    expect(createSchemaForm(doc, "title")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "title",
    });
    expect(createSchemaForm(doc, "/missing")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
  });
});
