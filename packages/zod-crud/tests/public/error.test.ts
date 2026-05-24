import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument, JSONCrudError } from "../../src/index.js";

describe("JSONCrudError", () => {
  test("exposes op, result, name, and operation-specific message", () => {
    const result = {
      ok: false,
      code: "invalid_pointer",
      reason: "JSON Pointer must be empty or start with '/'",
      pointer: "name",
    } as const;
    const error = new JSONCrudError("patch", result);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("JSONCrudError");
    expect(error.op).toBe("patch");
    expect(error.result).toBe(result);
    expect(error.message).toBe(
      "zod-crud patch failed: invalid_pointer — JSON Pointer must be empty or start with '/'",
    );
  });

  test("formats JSON Patch operation labels in messages", () => {
    const error = new JSONCrudError(
      { op: "replace", path: "/name", value: "next" },
      { ok: false, code: "schema_violation" },
    );

    expect(error.message).toBe("zod-crud replace failed: schema_violation");
  });

  test("strict document operations throw JSONCrudError through the public facade", () => {
    const doc = createJSONDocument(z.object({ name: z.string() }), { name: "ok" });

    expect(() => doc.patch({ op: "replace", path: "/name", value: 1 })).toThrow(JSONCrudError);
    expect(doc.value).toEqual({ name: "ok" });
  });
});
