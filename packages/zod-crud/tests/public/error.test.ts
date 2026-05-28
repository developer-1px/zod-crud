import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument, JSONCrudError } from "zod-crud";

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

  test("strict false returns document execution failures and calls onError", () => {
    const onError = vi.fn();
    const doc = createJSONDocument(z.object({ name: z.string() }), { name: "ok" }, {
      strict: false,
      onError,
    });

    expect(doc.patch({ op: "replace", path: "/name", value: 1 })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.commit([{ op: "replace", path: "/name", value: 1 }])).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.load({ name: 1 })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.reset({ name: 1 })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(onError).toHaveBeenCalledTimes(4);
    for (const [error] of onError.mock.calls) {
      expect(error).toBeInstanceOf(JSONCrudError);
    }
    expect(doc.value).toEqual({ name: "ok" });
  });

  test("onError runs before strict document execution failures throw", () => {
    const onError = vi.fn();
    const doc = createJSONDocument(z.object({ name: z.string() }), { name: "ok" }, { onError });

    expect(() => doc.patch({ op: "replace", path: "/name", value: 1 })).toThrow(JSONCrudError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(JSONCrudError);
    expect(doc.value).toEqual({ name: "ok" });
  });

  test("non-execution APIs keep their result surface under strict mode", () => {
    const onError = vi.fn();
    const doc = createJSONDocument(z.object({
      name: z.string(),
      items: z.array(z.object({ id: z.string() })),
    }), {
      name: "ok",
      items: [{ id: "a" }],
    }, {
      strict: true,
      onError,
    });

    expect(doc.canPatch({ op: "replace", path: "/name", value: 1 })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.duplicate("/missing")).toMatchObject({ ok: false });
    expect(doc.clipboard.write({ run: () => undefined })).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(doc.schema.accepts("/name", 1)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(onError).not.toHaveBeenCalled();
  });

  test("invalid initial values throw Zod errors without onError", () => {
    const onError = vi.fn();

    expect(() => createJSONDocument(
      z.object({ name: z.string() }),
      { name: 1 } as never,
      { onError },
    )).toThrow(z.ZodError);
    expect(onError).not.toHaveBeenCalled();
  });

  test("production default returns document execution failures unless strict overrides", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();
    try {
      const fresh = await import("zod-crud");
      const doc = fresh.createJSONDocument(z.object({ name: z.string() }), { name: "ok" });

      expect(doc.patch({ op: "replace", path: "/name", value: 1 })).toMatchObject({
        ok: false,
        code: "schema_violation",
      });
      expect(doc.value).toEqual({ name: "ok" });

      const strictDoc = fresh.createJSONDocument(
        z.object({ name: z.string() }),
        { name: "ok" },
        { strict: true },
      );
      expect(() => strictDoc.patch({ op: "replace", path: "/name", value: 1 }))
        .toThrow(fresh.JSONCrudError);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
      vi.resetModules();
    }
  });
});
