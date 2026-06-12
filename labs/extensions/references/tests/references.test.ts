import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  canSetReference,
  createReferences,
  indexReferences,
  type ReferencesDescriptor,
} from "../src/index.js";

const EntrySchema = z.object({
  uid: z.string().min(1),
  title: z.string(),
});

const PageSchema = z.object({
  slug: z.string(),
  hero: z.string().nullable(),
  related: z.array(z.unknown()),
});

const SiteSchema = z.object({
  entries: z.array(EntrySchema),
  pages: z.array(PageSchema),
});

const descriptor: ReferencesDescriptor = {
  targets: [{
    target: "entry",
    query: "$.entries[*]",
    readId: (value) => isRecord(value) ? value.uid : undefined,
    readLabel: (value) => isRecord(value) && typeof value.title === "string" ? value.title : undefined,
  }],
  fields: [
    {
      field: "hero",
      target: "entry",
      query: "$.pages[*].hero",
    },
    {
      field: "related",
      target: "entry",
      query: "$.pages[*].related",
    },
  ],
};

function createSite() {
  return createJSONDocument(SiteSchema, {
    entries: [
      { uid: "hero", title: "Hero" },
      { uid: "footer", title: "Footer" },
      { uid: "aside", title: "Aside" },
    ],
    pages: [
      { slug: "home", hero: "hero", related: ["footer", "missing", 7] },
      { slug: "about", hero: null, related: ["aside"] },
    ],
  });
}

describe("@interactive-os/json-document-references", () => {
  test("indexes targets, outgoing references, backlinks, and diagnostics", () => {
    const doc = createSite();
    const references = createReferences(doc, descriptor);

    const snapshot = references.current();

    expect(snapshot).toMatchObject({
      targetCount: 3,
      linkCount: 4,
      missingTargets: 1,
      invalidValues: 1,
      duplicateTargets: 0,
    });
    expect(snapshot.targets.map((target) => [target.id, target.pointer])).toEqual([
      ["hero", "/entries/0"],
      ["footer", "/entries/1"],
      ["aside", "/entries/2"],
    ]);
    expect(references.outgoing("/pages/0").map((link) => [link.field, link.id, link.targetPointer])).toEqual([
      ["hero", "hero", "/entries/0"],
      ["related", "footer", "/entries/1"],
      ["related", "missing", null],
    ]);
    expect(references.backlinks("entry", "footer")).toMatchObject({
      ok: true,
      links: [{ source: "/pages/0/related", valuePointer: "/pages/0/related/0" }],
    });
    expect(snapshot.diagnostics.map((entry) => [entry.code, entry.pointer]).sort()).toEqual([
      ["invalid_reference_value", "/pages/0/related/2"],
      ["missing_target", "/pages/0/related/1"],
    ].sort());
  });

  test("resolves by stable id after target reorder", () => {
    const doc = createSite();
    const references = createReferences(doc, descriptor);

    expect(references.resolve("entry", "hero")).toMatchObject({
      ok: true,
      target: { pointer: "/entries/0" },
    });

    doc.replace("/entries", [
      { uid: "footer", title: "Footer" },
      { uid: "aside", title: "Aside" },
      { uid: "hero", title: "Hero" },
    ]);

    expect(references.resolve("entry", "hero")).toMatchObject({
      ok: true,
      target: { pointer: "/entries/2" },
    });
    expect(references.backlinks("entry", "hero")).toMatchObject({
      ok: true,
      links: [{ targetPointer: "/entries/2" }],
    });
  });

  test("reports duplicate ids and ambiguous references", () => {
    const doc = createSite();
    const references = createReferences(doc, descriptor);

    doc.replace("/entries/1/uid", "hero");

    expect(references.current().diagnostics.map((entry) => entry.code)).toContain("duplicate_target_id");
    expect(references.resolve("entry", "hero")).toMatchObject({
      ok: false,
      code: "ambiguous_target_id",
      id: "hero",
    });
    expect(references.outgoing("/pages/0")[0]).toMatchObject({
      id: "hero",
      targetPointer: null,
    });
  });

  test("sets reference fields through schema-safe patch checks", () => {
    const doc = createSite();
    const references = createReferences(doc, descriptor);

    expect(references.canSet({
      field: "hero",
      source: "/pages/0/hero",
      value: "footer",
    })).toMatchObject({
      ok: true,
      operation: { op: "replace", path: "/pages/0/hero", value: "footer" },
    });
    expect(references.set({
      field: "hero",
      source: "/pages/0/hero",
      value: "footer",
    })).toMatchObject({ ok: true });
    expect(doc.value.pages[0]?.hero).toBe("footer");
  });

  test("rejects missing targets, invalid reference values, unknown fields, and schema violations", () => {
    const doc = createSite();
    const references = createReferences(doc, descriptor);

    expect(references.canSet({
      field: "hero",
      source: "/pages/0/hero",
      value: "unknown",
    })).toMatchObject({
      ok: false,
      code: "target_not_found",
      id: "unknown",
    });
    expect(references.canSet({
      field: "hero",
      source: "/pages/0/hero",
      value: 1,
    })).toMatchObject({
      ok: false,
      code: "invalid_reference_value",
      pointer: "/pages/0/hero",
    });
    expect(references.canSet({
      field: "unknown",
      source: "/pages/0/hero",
      value: "hero",
    })).toMatchObject({
      ok: false,
      code: "descriptor_not_found",
    });
    expect(canSetReference(doc, descriptor, {
      field: "hero",
      source: "/pages/0/hero",
      value: ["hero"],
    })).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: { ok: false, code: "schema_violation" },
    });
  });

  test("does not assume id field names", () => {
    const doc = createSite();

    expect(indexReferences(doc, descriptor).targets.map((target) => target.id)).toEqual([
      "hero",
      "footer",
      "aside",
    ]);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
