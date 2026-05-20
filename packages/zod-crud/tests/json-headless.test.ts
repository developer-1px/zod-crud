import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSON } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
});

describe("createJSON", () => {
  test("owns low-level JSONOps state without React", () => {
    const changes: unknown[] = [];
    const json = createJSON(Schema, { title: "draft", tags: [] }, {
      onChange: () => changes.push("change"),
    });
    json.subscribe((applied, metadata) => {
      changes.push({ applied, metadata });
    });

    expect(json.value).toEqual({ title: "draft", tags: [] });
    expect(json.ops.add("/tags/-", "docs")).toEqual({ ok: true });
    expect(json.ops.replace("/title", "final")).toEqual({ ok: true });
    expect(json.value).toEqual({ title: "final", tags: ["docs"] });
    expect(json.ops.state).toBe(json.value);

    const metadata = { label: "bulk", origin: "programmatic" };
    expect(json.ops.patch([{ op: "add", path: "/tags/-", value: "api" }], metadata)).toEqual({ ok: true });

    expect(changes).toEqual([
      "change",
      { applied: [{ op: "add", path: "/tags/0", value: "docs" }], metadata: undefined },
      "change",
      { applied: [{ op: "replace", path: "/title", value: "final" }], metadata: undefined },
      "change",
      { applied: [{ op: "add", path: "/tags/1", value: "api" }], metadata },
    ]);

    json.dispose();
    expect(json.ops.replace("/title", "quiet")).toEqual({ ok: true });
    expect(json.value.title).toBe("quiet");
    expect(changes).toHaveLength(6);
  });

  test("load/reset and set match the low-level useJSON contract", () => {
    const json = createJSON(Schema, { title: "draft", tags: [] }, { strict: false });

    expect(json.ops.set("/tags/0", "first")).toEqual({ ok: true });
    expect(json.value.tags).toEqual(["first"]);
    expect(json.ops.set("/tags/0", undefined)).toEqual({ ok: true });
    expect(json.value.tags).toEqual([]);

    expect(json.ops.load({ title: "loaded", tags: ["x"] })).toEqual({ ok: true });
    expect(json.value).toEqual({ title: "loaded", tags: ["x"] });
    expect(json.ops.reset()).toEqual({ ok: true });
    expect(json.value).toEqual({ title: "draft", tags: [] });
    expect(json.ops.load({ title: 1, tags: [] } as never)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
  });
});
