import { describe, expect, it } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "../../../src/index.js";

describe("JSONDocument clipboard", () => {
  const Item = z.object({
    id: z.string(),
    title: z.string(),
  });
  const Schema = z.object({
    items: z.array(Item),
  });

  it("trustedPayload write still clones the payload boundary", () => {
    const doc = createJSONDocument(Schema, { items: [{ id: "a", title: "A" }] });
    const payload = [{ id: "b", title: "B" }];

    const written = doc.clipboard.write(payload, { trustedPayload: true });
    expect(written.ok).toBe(true);

    payload[0]!.title = "changed";
    const firstRead = doc.clipboard.read();
    expect(firstRead.ok).toBe(true);
    if (!firstRead.ok) return;
    expect(firstRead.payload).toEqual([{ id: "b", title: "B" }]);

    (firstRead.payload as Array<{ title: string }>)[0]!.title = "read changed";
    const secondRead = doc.clipboard.read();
    expect(secondRead.ok).toBe(true);
    if (!secondRead.ok) return;
    expect(secondRead.payload).toEqual([{ id: "b", title: "B" }]);
  });

  it("trustedPayload write does not make external payload schema-trusted", () => {
    const doc = createJSONDocument(Schema, { items: [{ id: "a", title: "A" }] });

    const written = doc.clipboard.write([{ id: 1, title: "bad" }], {
      source: "/items",
      trustedPayload: true,
    });
    expect(written.ok).toBe(true);

    const canPaste = doc.canPaste({ replace: "/items" });
    expect(canPaste.ok).toBe(false);
    if (canPaste.ok) return;
    expect(canPaste.code).toBe("schema_violation");
  });

  it("default write keeps rejecting non-JSON payloads", () => {
    const doc = createJSONDocument(Schema, { items: [] });

    const written = doc.clipboard.write({ run: () => undefined });
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.code).toBe("not_serializable");
  });
});
