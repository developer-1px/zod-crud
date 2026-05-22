import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../src/index.js";

describe("doc.history performance contract", () => {
  test("undo and redo replay trusted history without revalidating the whole schema", () => {
    let validations = 0;
    const Schema = z.object({
      items: z.array(z.object({ title: z.string(), done: z.boolean() })),
    }).superRefine(() => {
      validations += 1;
    });
    const initial = {
      items: Array.from({ length: 100 }, (_, index) => ({
        title: `item ${index}`,
        done: false,
      })),
    };

    const doc = createJSONDocument(Schema, initial, { history: 10 });
    const validationsAfterCreate = validations;

    expect(doc.patch({ op: "replace", path: "/items/50/done", value: true })).toEqual({ ok: true });
    expect(validations).toBeGreaterThan(validationsAfterCreate);
    const validationsAfterPatch = validations;

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.items[50]?.done).toBe(false);
    expect(validations).toBe(validationsAfterPatch);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.items[50]?.done).toBe(true);
    expect(validations).toBe(validationsAfterPatch);
  });
});
