import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canAcceptChange,
  canProposeChange,
  createProposedChanges,
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

describe("@zod-crud/proposed-changes", () => {
  test("proposes a patch without mutating and accepts it later", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    const proposed = changes.propose({
      id: "rename",
      operations: { op: "replace", path: "/title", value: "Reviewed" },
      label: "Rename page",
    });

    expect(proposed).toMatchObject({
      ok: true,
      change: {
        id: "rename",
        status: "open",
        operations: [{ op: "replace", path: "/title", value: "Reviewed" }],
        guards: [{ path: "/title", value: "Draft" }],
      },
    });
    expect(doc.value.title).toBe("Draft");

    expect(changes.canAccept("rename")).toMatchObject({ ok: true });
    expect(changes.accept("rename", { label: "accept change" })).toMatchObject({
      ok: true,
      change: { status: "accepted" },
      result: { ok: true },
    });
    expect(doc.value.title).toBe("Reviewed");
    expect(changes.current({ status: "all" })).toMatchObject({
      open: 0,
      accepted: 1,
      rejected: 0,
    });
  });

  test("rejects a change without mutating the document", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    changes.propose({
      id: "publish",
      operations: { op: "replace", path: "/status", value: "published" },
    });

    expect(changes.reject("publish")).toMatchObject({
      ok: true,
      change: { status: "rejected" },
    });
    expect(doc.value.status).toBe("draft");
    expect(changes.canAccept("publish")).toMatchObject({
      ok: false,
      code: "not_open",
    });
  });

  test("detects stale changes before accepting", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    changes.propose({
      id: "rename",
      operations: { op: "replace", path: "/title", value: "Reviewed" },
    });
    doc.replace("/title", "Edited directly");

    expect(canAcceptChange(doc, new Map([["rename", changes.byId("rename")!]]), "rename")).toMatchObject({
      ok: false,
      code: "stale_change",
      pointer: "/title",
    });
    expect(changes.accept("rename")).toMatchObject({
      ok: false,
      code: "stale_change",
    });
    expect(doc.value.title).toBe("Edited directly");
    expect(changes.byId("rename")).toMatchObject({ status: "open" });
  });

  test("rejects schema-invalid proposals before storing them", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    expect(changes.canPropose({
      id: "bad-status",
      operations: { op: "replace", path: "/status", value: "invalid" },
    })).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: { ok: false, code: "schema_violation" },
    });
    expect(changes.propose({
      id: "bad-status",
      operations: { op: "replace", path: "/status", value: "invalid" },
    })).toMatchObject({
      ok: false,
      code: "patch_rejected",
    });
    expect(changes.byId("bad-status")).toBeNull();
  });

  test("guards parent arrays for proposed insertions", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    changes.propose({
      id: "append",
      operations: { op: "add", path: "/sections/-", value: { id: "tail", title: "Tail" } },
    });
    doc.insert("/sections/-", { id: "direct", title: "Direct" });

    expect(changes.accept("append")).toMatchObject({
      ok: false,
      code: "stale_change",
      pointer: "/sections",
    });
    expect(doc.value.sections.map((section) => section.id)).toEqual(["intro", "body", "direct"]);
  });

  test("documents guard semantics for patch operation kinds", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    expect(changes.canPropose({
      operations: { op: "replace", path: "/title", value: "Reviewed" },
    })).toMatchObject({
      ok: true,
      guards: [{ path: "/title", value: "Draft" }],
    });
    expect(changes.canPropose({
      operations: { op: "remove", path: "/sections/0" },
    })).toMatchObject({
      ok: true,
      guards: [{ path: "/sections/0", value: { id: "intro", title: "Intro" } }],
    });
    expect(changes.canPropose({
      operations: { op: "add", path: "/sections/-", value: { id: "tail", title: "Tail" } },
    })).toMatchObject({
      ok: true,
      guards: [{ path: "/sections" }],
    });
    expect(changes.canPropose({
      operations: { op: "move", from: "/sections/0", path: "/sections/1" },
    })).toMatchObject({
      ok: true,
      guards: [{ path: "/sections/0" }, { path: "/sections" }],
    });
    expect(changes.canPropose({
      operations: { op: "copy", from: "/title", path: "/sections/0/title" },
    })).toMatchObject({
      ok: true,
      guards: [{ path: "/title" }, { path: "/sections/0" }],
    });
  });

  test("restores persisted changes and keeps generated ids monotonic", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);

    changes.propose({
      operations: { op: "replace", path: "/title", value: "Reviewed" },
      data: {
        proposedBy: "ai",
        source: "nano-edit",
        createdAt: "2026-05-29T00:00:00.000Z",
      },
    });
    const persisted = changes.current({ status: "all" }).changes;

    const restored = createProposedChanges(doc, { initial: persisted });
    expect(restored.current({ status: "all" })).toMatchObject({
      changes: [{
        id: "change-1",
        status: "open",
        data: {
          proposedBy: "ai",
          source: "nano-edit",
        },
      }],
    });

    expect(restored.propose({
      operations: { op: "replace", path: "/status", value: "review" },
    })).toMatchObject({
      ok: true,
      change: { id: "change-2" },
    });
  });

  test("copies proposal inputs and reports duplicate or empty proposals", () => {
    const doc = createPage();
    const changes = createProposedChanges(doc);
    const operations = [{ op: "replace" as const, path: "/title", value: "Reviewed" }];

    expect(changes.propose({ id: "rename", operations })).toMatchObject({ ok: true });
    operations[0]!.value = "Mutated";

    expect(changes.byId("rename")).toMatchObject({
      operations: [{ value: "Reviewed" }],
    });
    expect(canProposeChange(doc, new Map([["rename", changes.byId("rename")!]]), {
      id: "rename",
      operations: { op: "replace", path: "/title", value: "Other" },
    })).toMatchObject({
      ok: false,
      code: "duplicate_id",
    });
    expect(changes.canPropose({ operations: [] })).toMatchObject({
      ok: false,
      code: "empty_patch",
    });
  });
});
