import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canDeleteAll,
  canReplaceAll,
  createBulkEdit,
  deleteAll,
  replaceAll,
} from "../src/index.js";

const Task = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
  archived: z.boolean(),
});

const Board = z.object({
  tasks: z.array(Task),
});

function createBoard() {
  return createJSONDocument(Board, {
    tasks: [
      { id: "a", title: " Alpha ", done: false, archived: false },
      { id: "b", title: "Beta", done: false, archived: true },
      { id: "c", title: " Gamma ", done: false, archived: true },
      { id: "d", title: "Delta", done: false, archived: true },
      { id: "e", title: "Epsilon", done: false, archived: false },
    ],
  }, {
    history: 20,
  });
}

describe("@zod-crud/bulk-edit", () => {
  test("replaces all JSONPath matches through public document patching", () => {
    const doc = createBoard();
    const bulk = createBulkEdit(doc);

    expect(bulk.canReplaceAll("$.tasks[*].done", true)).toMatchObject({
      ok: true,
      count: 5,
    });
    expect(bulk.replaceAll("$.tasks[*].done", true)).toMatchObject({
      ok: true,
      count: 5,
    });

    expect(doc.value.tasks.every((task) => task.done)).toBe(true);
    expect(doc.lastPatch).toEqual([
      { op: "replace", path: "/tasks/4/done", value: true },
      { op: "replace", path: "/tasks/3/done", value: true },
      { op: "replace", path: "/tasks/2/done", value: true },
      { op: "replace", path: "/tasks/1/done", value: true },
      { op: "replace", path: "/tasks/0/done", value: true },
    ]);
  });

  test("maps replacement values from the current query matches", () => {
    const doc = createBoard();

    expect(replaceAll(doc, "$.tasks[*].title", ({ value }) => String(value).trim())).toMatchObject({
      ok: true,
      count: 5,
    });

    expect(doc.value.tasks.map((task) => task.title)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Delta",
      "Epsilon",
    ]);
  });

  test("deletes array matches from the back to avoid pointer drift", () => {
    const doc = createBoard();

    expect(deleteAll(doc, "$.tasks[1:4]")).toMatchObject({
      ok: true,
      count: 3,
      pointers: ["/tasks/3", "/tasks/2", "/tasks/1"],
    });

    expect(doc.value.tasks.map((task) => task.id)).toEqual(["a", "e"]);
    expect(doc.lastPatch).toEqual([
      { op: "remove", path: "/tasks/3" },
      { op: "remove", path: "/tasks/2" },
      { op: "remove", path: "/tasks/1" },
    ]);
  });

  test("deduplicates repeated JSONPath pointer matches before patching", () => {
    const doc = createBoard();

    expect(deleteAll(doc, "$.tasks[1,1]")).toMatchObject({
      ok: true,
      count: 1,
      pointers: ["/tasks/1"],
    });

    expect(doc.value.tasks.map((task) => task.id)).toEqual(["a", "c", "d", "e"]);
    expect(doc.lastPatch).toEqual([
      { op: "remove", path: "/tasks/1" },
    ]);
  });

  test("rejects schema-invalid replacements without mutating", () => {
    const doc = createBoard();

    expect(canReplaceAll(doc, "$.tasks[*].title", 123)).toMatchObject({
      ok: false,
      code: "patch_rejected",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(replaceAll(doc, "$.tasks[*].title", 123)).toMatchObject({
      ok: false,
      code: "patch_rejected",
    });

    expect(doc.value.tasks.map((task) => task.title)).toEqual([
      " Alpha ",
      "Beta",
      " Gamma ",
      "Delta",
      "Epsilon",
    ]);
    expect(doc.history.undoDepth).toBe(0);
  });

  test("reports invalid and empty queries as extension errors", () => {
    const doc = createBoard();
    const bulk = createBulkEdit(doc);

    expect(bulk.canDeleteAll("$[")).toMatchObject({
      ok: false,
      code: "invalid_query",
    });
    expect(bulk.deleteAll("$.missing[*]")).toMatchObject({
      ok: false,
      code: "empty_match",
    });

    expect(doc.value.tasks.map((task) => task.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("exports standalone delete preflight", () => {
    const doc = createBoard();

    expect(canDeleteAll(doc, "$.tasks[?(@.archived==true)]")).toMatchObject({
      ok: true,
      count: 3,
    });
  });
});
