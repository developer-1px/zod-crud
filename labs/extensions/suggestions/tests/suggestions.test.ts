import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canAcceptSuggestion,
  canProposeSuggestion,
  createSuggestions,
} from "../src/index.js";

const PageSchema = z.object({
  title: z.string().min(1),
  status: z.enum(["draft", "review", "published"]),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string().min(1),
  })),
});

function createPage() {
  return createJSONDocument(PageSchema, {
    title: "Draft",
    status: "draft",
    sections: [
      { id: "intro", title: "Intro" },
      { id: "body", title: "Body" },
    ],
  });
}

describe("@zod-crud/suggestions", () => {
  test("proposes a patch without mutating and accepts it later", () => {
    const doc = createPage();
    const suggestions = createSuggestions(doc);

    const proposed = suggestions.propose({
      id: "rename",
      operations: { op: "replace", path: "/title", value: "Reviewed" },
      label: "Rename page",
    });

    expect(proposed).toMatchObject({
      ok: true,
      suggestion: {
        id: "rename",
        status: "open",
        operations: [{ op: "replace", path: "/title", value: "Reviewed" }],
        guards: [{ path: "/title", value: "Draft" }],
      },
    });
    expect(doc.value.title).toBe("Draft");

    expect(suggestions.canAccept("rename")).toMatchObject({ ok: true });
    expect(suggestions.accept("rename", { label: "accept suggestion" })).toMatchObject({
      ok: true,
      suggestion: { status: "accepted" },
      result: { ok: true },
    });
    expect(doc.value.title).toBe("Reviewed");
    expect(suggestions.current({ status: "all" })).toMatchObject({
      open: 0,
      accepted: 1,
      rejected: 0,
    });
  });

  test("rejects a suggestion without mutating the document", () => {
    const doc = createPage();
    const suggestions = createSuggestions(doc);

    suggestions.propose({
      id: "publish",
      operations: { op: "replace", path: "/status", value: "published" },
    });

    expect(suggestions.reject("publish")).toMatchObject({
      ok: true,
      suggestion: { status: "rejected" },
    });
    expect(doc.value.status).toBe("draft");
    expect(suggestions.canAccept("publish")).toMatchObject({
      ok: false,
      code: "not_open",
    });
  });

  test("detects stale suggestions before accepting", () => {
    const doc = createPage();
    const suggestions = createSuggestions(doc);

    suggestions.propose({
      id: "rename",
      operations: { op: "replace", path: "/title", value: "Reviewed" },
    });
    doc.replace("/title", "Edited directly");

    expect(canAcceptSuggestion(doc, new Map([["rename", suggestions.byId("rename")!]]), "rename")).toMatchObject({
      ok: false,
      code: "stale_suggestion",
      pointer: "/title",
    });
    expect(suggestions.accept("rename")).toMatchObject({
      ok: false,
      code: "stale_suggestion",
    });
    expect(doc.value.title).toBe("Edited directly");
    expect(suggestions.byId("rename")).toMatchObject({ status: "open" });
  });

  test("rejects schema-invalid proposals before storing them", () => {
    const doc = createPage();
    const suggestions = createSuggestions(doc);

    expect(suggestions.canPropose({
      id: "bad-status",
      operations: { op: "replace", path: "/status", value: "invalid" },
    })).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: { ok: false, code: "schema_violation" },
    });
    expect(suggestions.propose({
      id: "bad-status",
      operations: { op: "replace", path: "/status", value: "invalid" },
    })).toMatchObject({
      ok: false,
      code: "patch_rejected",
    });
    expect(suggestions.byId("bad-status")).toBeNull();
  });

  test("guards parent arrays for proposed insertions", () => {
    const doc = createPage();
    const suggestions = createSuggestions(doc);

    suggestions.propose({
      id: "append",
      operations: { op: "add", path: "/sections/-", value: { id: "tail", title: "Tail" } },
    });
    doc.insert("/sections/-", { id: "direct", title: "Direct" });

    expect(suggestions.accept("append")).toMatchObject({
      ok: false,
      code: "stale_suggestion",
      pointer: "/sections",
    });
    expect(doc.value.sections.map((section) => section.id)).toEqual(["intro", "body", "direct"]);
  });

  test("copies proposal inputs and reports duplicate or empty proposals", () => {
    const doc = createPage();
    const suggestions = createSuggestions(doc);
    const operations = [{ op: "replace" as const, path: "/title", value: "Reviewed" }];

    expect(suggestions.propose({ id: "rename", operations })).toMatchObject({ ok: true });
    operations[0]!.value = "Mutated";

    expect(suggestions.byId("rename")).toMatchObject({
      operations: [{ value: "Reviewed" }],
    });
    expect(canProposeSuggestion(doc, new Map([["rename", suggestions.byId("rename")!]]), {
      id: "rename",
      operations: { op: "replace", path: "/title", value: "Other" },
    })).toMatchObject({
      ok: false,
      code: "duplicate_id",
    });
    expect(suggestions.canPropose({ operations: [] })).toMatchObject({
      ok: false,
      code: "empty_patch",
    });
  });
});
