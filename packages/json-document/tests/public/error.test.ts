import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument, JSONDocumentError } from "@interactive-os/json-document";

describe("JSONDocumentError", () => {
  test("exposes op, result, name, and operation-specific message", () => {
    const result = {
      ok: false,
      code: "invalid_pointer",
      reason: "JSON Pointer must be empty or start with '/'",
      pointer: "name",
    } as const;
    const error = new JSONDocumentError("patch", result);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("JSONDocumentError");
    expect(error.op).toBe("patch");
    expect(error.result).toBe(result);
    expect(error.message).toBe(
      "json-document patch failed: invalid_pointer — JSON Pointer must be empty or start with '/'",
    );
  });

  test("formats JSON Patch operation labels in messages", () => {
    const error = new JSONDocumentError(
      { op: "replace", path: "/name", value: "next" },
      { ok: false, code: "schema_violation" },
    );

    expect(error.message).toBe("json-document replace failed: schema_violation");
  });

  test("strict true document operations throw JSONDocumentError through the public facade", () => {
    const doc = createJSONDocument(z.object({ name: z.string() }), { name: "ok" }, { strict: true });

    expect(() => doc.patch({ op: "replace", path: "/name", value: 1 })).toThrow(JSONDocumentError);
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
      expect(error).toBeInstanceOf(JSONDocumentError);
    }
    expect(doc.value).toEqual({ name: "ok" });
  });

  test("onError runs before strict true document execution failures throw", () => {
    const onError = vi.fn();
    const doc = createJSONDocument(z.object({ name: z.string() }), { name: "ok" }, { strict: true, onError });

    expect(() => doc.patch({ op: "replace", path: "/name", value: 1 })).toThrow(JSONDocumentError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(JSONDocumentError);
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

  test("default strict policy returns document execution failures unless strict overrides", () => {
    const doc = createJSONDocument(z.object({ name: z.string() }), { name: "ok" });

    expect(doc.patch({ op: "replace", path: "/name", value: 1 })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.value).toEqual({ name: "ok" });
  });
});
