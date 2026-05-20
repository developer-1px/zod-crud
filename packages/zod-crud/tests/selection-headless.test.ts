import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument, createSelection } from "../src/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

describe("createSelection", () => {
  test("provides headless multi-selection and caret tracking over JSON ops", () => {
    const doc = createJSONDocument(Schema, initial);
    const selection = createSelection(doc.ops, {
      mode: "multiple",
      initial: ["/items/0"],
    });
    const changes: unknown[] = [];
    selection.subscribe((snapshot, previous) => {
      changes.push({ snapshot, previous });
    });

    expect(selection.selectedPointers).toEqual(["/items/0"]);
    expect(selection.primaryPointer).toBe("/items/0");

    selection.addRange({ path: "/items/1/name", offset: 99, affinity: "forward" });

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/1/name"]);
    expect(selection.primaryRange).toEqual({
      anchor: { path: "/items/1/name", offset: 1, affinity: "forward" },
      focus: { path: "/items/1/name", offset: 1, affinity: "forward" },
    });
    expect(selection.selectedSource).toEqual(["/items/0", "/items/1/name"]);

    doc.ops.remove("/items/0");

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/0/name"]);
    expect(selection.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      {
        anchor: { path: "/items/0/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/0/name", offset: 1, affinity: "forward" },
      },
    ]);
    expect(JSON.parse(JSON.stringify(selection))).toEqual(selection.snapshot());
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      previous: { selectedPointers: ["/items/0"] },
      snapshot: { selectedPointers: ["/items/0", "/items/1/name"] },
    });

    selection.dispose();
    doc.ops.remove("/items/0");

    expect(selection.selectedPointers).toEqual(["/items/0", "/items/0/name"]);
    expect(changes).toHaveLength(2);
  });
});
