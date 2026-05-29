import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canPatchProtectedRanges,
  createProtectedRanges,
  type ProtectedRange,
} from "../src/index.js";

const Section = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});
const Page = z.object({
  title: z.string(),
  slug: z.string(),
  sections: z.array(Section),
});

function createPage() {
  return createJSONDocument(Page, {
    title: "Draft",
    slug: "stable-slug",
    sections: [
      { id: "intro", title: "Intro", body: "Opening" },
      { id: "legal", title: "Legal", body: "Do not edit" },
      { id: "cta", title: "CTA", body: "Act" },
    ],
  });
}

function createRanges(): ProtectedRange[] {
  return [
    { id: "slug", pointer: "/slug", label: "Published slug" },
    { id: "legal", pointer: "/sections/1", label: "Legal section" },
  ];
}

describe("@zod-crud/protected-ranges", () => {
  test("lists protected ranges without exposing mutable range records", () => {
    const ranges = createRanges();
    const protectedRanges = createProtectedRanges(createPage(), ranges);

    expect(protectedRanges.list()).toEqual([
      { id: "slug", pointer: "/slug", label: "Published slug" },
      { id: "legal", pointer: "/sections/1", label: "Legal section" },
    ]);

    ranges[0]!.pointer = "/title";
    expect(protectedRanges.list()[0]).toEqual({
      id: "slug",
      pointer: "/slug",
      label: "Published slug",
    });
  });

  test("blocks protected direct replacements before core schema checks", () => {
    const doc = createPage();
    const protectedRanges = createProtectedRanges(doc, createRanges());

    expect(protectedRanges.canReplace("/slug", "next")).toMatchObject({
      ok: false,
      code: "protected_range",
      operation: "replace",
      pointer: "/slug",
      range: { id: "slug", pointer: "/slug" },
    });
    expect(protectedRanges.replace("/slug", "next")).toMatchObject({
      ok: false,
      code: "protected_range",
    });
    expect(doc.value.slug).toBe("stable-slug");
  });

  test("allows unprotected edits and preserves document capability failures", () => {
    const doc = createPage();
    const protectedRanges = createProtectedRanges(doc, createRanges());

    expect(protectedRanges.replace("/title", "Next")).toEqual({ ok: true });
    expect(doc.value.title).toBe("Next");

    expect(protectedRanges.canReplace("/title", 123)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
  });

  test("blocks ancestor deletion and descendant mutation of a protected subtree", () => {
    const doc = createPage();
    const protectedRanges = createProtectedRanges(doc, createRanges());

    expect(protectedRanges.canDelete("/sections")).toMatchObject({
      ok: false,
      code: "protected_range",
      pointer: "/sections",
      range: { id: "legal" },
    });
    expect(protectedRanges.canReplace("/sections/1/title", "Legal next")).toMatchObject({
      ok: false,
      code: "protected_range",
      pointer: "/sections/1/title",
      range: { id: "legal" },
    });
    expect(doc.value.sections[1]?.title).toBe("Legal");
  });

  test("blocks array edits that would reindex a protected item", () => {
    const doc = createPage();
    const protectedRanges = createProtectedRanges(doc, createRanges());

    expect(protectedRanges.canInsert("/sections/0", {
      id: "new",
      title: "New",
      body: "Before",
    })).toMatchObject({
      ok: false,
      code: "protected_range",
      pointer: "/sections/0",
      range: { id: "legal" },
    });
    expect(protectedRanges.canInsert("/sections/-", {
      id: "tail",
      title: "Tail",
      body: "After",
    })).toEqual({ ok: true });
    expect(protectedRanges.insert("/sections/-", {
      id: "tail",
      title: "Tail",
      body: "After",
    })).toEqual({ ok: true });
    expect(doc.value.sections.map((section) => section.id)).toEqual(["intro", "legal", "cta", "tail"]);
  });

  test("guards patch, move, and paste through the same protected range rules", () => {
    const doc = createPage();
    const ranges = createRanges();
    const protectedRanges = createProtectedRanges(doc, ranges);

    expect(canPatchProtectedRanges(doc, ranges, [
      { op: "replace", path: "/sections/1/body", value: "Changed" },
    ])).toMatchObject({
      ok: false,
      code: "protected_range",
      operation: "patch",
    });
    expect(protectedRanges.canMove("/sections/0", "/sections/2")).toMatchObject({
      ok: false,
      code: "protected_range",
      operation: "move",
    });
    expect(protectedRanges.canPaste({ before: "/sections/1" }, {
      payload: { id: "new", title: "New", body: "Before" },
    })).toMatchObject({
      ok: false,
      code: "protected_range",
      operation: "paste",
    });
    expect(protectedRanges.paste("/sections/-", {
      payload: { id: "tail", title: "Tail", body: "After" },
    })).toMatchObject({
      ok: true,
    });
  });
});
