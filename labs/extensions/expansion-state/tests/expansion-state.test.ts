import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createExpansionState } from "../src/index.js";

const Block = z.object({
  id: z.string(),
  text: z.string(),
});

const Section = z.object({
  id: z.string(),
  title: z.string(),
  blocks: z.array(Block),
});

const Schema = z.object({
  sections: z.array(Section),
  meta: z.object({
    title: z.string(),
  }),
});

function createDoc() {
  return createJSONDocument(Schema, {
    sections: [
      {
        id: "a",
        title: "A",
        blocks: [{ id: "a1", text: "Alpha" }],
      },
      {
        id: "b",
        title: "B",
        blocks: [{ id: "b1", text: "Beta" }],
      },
      {
        id: "c",
        title: "C",
        blocks: [],
      },
    ],
    meta: {
      title: "Doc",
    },
  });
}

describe("@zod-crud/expansion-state", () => {
  test("expands, collapses, toggles, and clears expandable pointers", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc);
    const listener = vi.fn();

    expansion.subscribe(listener);

    expect(expansion.canExpand("/sections")).toEqual({ ok: true });
    expect(expansion.expand("/sections")).toEqual({
      ok: true,
      snapshot: { expanded: ["/sections"], count: 1 },
    });
    expect(expansion.isExpanded("/sections")).toBe(true);

    expect(expansion.toggle("/meta")).toEqual({
      ok: true,
      snapshot: { expanded: ["/meta", "/sections"], count: 2 },
    });
    expect(expansion.collapse("/sections")).toEqual({
      ok: true,
      snapshot: { expanded: ["/meta"], count: 1 },
    });
    expansion.clear();
    expect(expansion.current()).toEqual({ expanded: [], count: 0 });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  test("rejects invalid, missing, and primitive expansion targets", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc);

    expect(expansion.expand("sections")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "sections",
    });
    expect(expansion.expand("/sections/9")).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/sections/9",
    });
    expect(expansion.expand("/sections/0/title")).toEqual({
      ok: false,
      code: "not_expandable",
      pointer: "/sections/0/title",
      reason: "pointer is not expandable: /sections/0/title",
    });
  });

  test("builds a visible tree from expanded pointers", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc, ["/sections", "/sections/0", "/sections/0/blocks"]);

    expect(expansion.visible("", { includeRoot: false }).ok).toBe(true);
    const visible = expansion.visible("", { includeRoot: false });
    if (!visible.ok) throw new Error(visible.reason);

    expect(visible.nodes.map((node) => [
      node.path,
      node.depth,
      node.expandable,
      node.expanded,
      node.childCount,
    ])).toEqual([
      ["/sections", 1, true, true, 3],
      ["/sections/0", 2, true, true, 3],
      ["/sections/0/id", 3, false, false, 0],
      ["/sections/0/title", 3, false, false, 0],
      ["/sections/0/blocks", 3, true, true, 1],
      ["/sections/0/blocks/0", 4, true, false, 2],
      ["/sections/1", 2, true, false, 3],
      ["/sections/2", 2, true, false, 3],
      ["/meta", 1, true, false, 1],
    ]);
  });

  test("limits visible traversal depth", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc, ["/sections", "/sections/0", "/sections/0/blocks"]);
    const visible = expansion.visible("", { includeRoot: false, maxDepth: 2 });

    if (!visible.ok) throw new Error(visible.reason);
    expect(visible.nodes.map((node) => node.path)).toEqual([
      "/sections",
      "/sections/0",
      "/sections/1",
      "/sections/2",
      "/meta",
    ]);
  });

  test("tracks expanded pointers through structural edits", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc, ["/sections/1", "/sections/1/blocks"]);

    expect(doc.insert("/sections/0", {
      id: "x",
      title: "Intro",
      blocks: [],
    })).toEqual({ ok: true });
    expect(expansion.current()).toEqual({
      expanded: ["/sections/2", "/sections/2/blocks"],
      count: 2,
    });

    expect(doc.delete("/sections/0")).toEqual({ ok: true });
    expect(expansion.current()).toEqual({
      expanded: ["/sections/1", "/sections/1/blocks"],
      count: 2,
    });

    expect(doc.move("/sections/1", "/sections/-")).toEqual({ ok: true });
    expect(expansion.current()).toEqual({
      expanded: ["/sections/2", "/sections/2/blocks"],
      count: 2,
    });
  });

  test("drops expanded pointers when tracked targets disappear or become primitive", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc, ["/sections/1", "/sections/1/blocks", "/meta"]);

    expect(doc.delete("/sections/1")).toEqual({ ok: true });
    expect(expansion.current()).toEqual({
      expanded: ["/meta"],
      count: 1,
    });

    expect(doc.replace("/meta", { title: "Renamed" })).toEqual({ ok: true });
    expect(expansion.current()).toEqual({
      expanded: ["/meta"],
      count: 1,
    });

    const UnionSchema = z.object({
      panel: z.union([
        z.object({ title: z.string() }),
        z.string(),
      ]),
    });
    const unionDoc = createJSONDocument(UnionSchema, {
      panel: { title: "Panel" },
    });
    const unionExpansion = createExpansionState(unionDoc, ["/panel"]);

    expect(unionDoc.replace("/panel", "collapsed")).toEqual({ ok: true });
    expect(unionExpansion.current()).toEqual({ expanded: [], count: 0 });
  });

  test("dispose stops patch-driven tracking", () => {
    const doc = createDoc();
    const expansion = createExpansionState(doc, ["/sections/1"]);
    const listener = vi.fn();

    expansion.subscribe(listener);
    expansion.dispose();

    expect(doc.insert("/sections/0", {
      id: "x",
      title: "Intro",
      blocks: [],
    })).toEqual({ ok: true });
    expect(expansion.current()).toEqual({
      expanded: ["/sections/1"],
      count: 1,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
