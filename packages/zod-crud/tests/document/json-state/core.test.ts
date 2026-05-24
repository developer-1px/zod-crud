import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  planJSONNotification,
  planJSONRootReplacement,
  planJSONRootReplacementParse,
  planJSONStateCommit,
} from "../../../src/application/document/jsonStatePlan.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/index.js";

describe("document JSON state core functions", () => {
  test("plans notifications only for non-empty patches before disposal", () => {
    const applied: JSONPatchOperation[] = [{ op: "replace", path: "/title", value: "final" }];

    expect(planJSONNotification({ applied, disposed: false })).toEqual({
      lastApplied: applied,
    });
    expect(planJSONNotification({ applied: [], disposed: false })).toEqual({
      lastApplied: null,
    });
    expect(planJSONNotification({ applied, disposed: true })).toEqual({
      lastApplied: null,
    });
  });

  test("plans root replacement state, trust, and notification patch", () => {
    const next = { title: "loaded" };

    expect(planJSONRootReplacement({
      next,
      schemaOutputJsonTrusted: false,
    })).toEqual({
      result: { ok: true },
      state: next,
      stateJsonTrusted: true,
      notifyApplied: [{ op: "replace", path: "", value: next }],
    });

    const nonSerializable = () => "bad";
    expect(planJSONRootReplacement({
      next: nonSerializable,
      schemaOutputJsonTrusted: false,
    })).toEqual({
      result: { ok: true },
      state: nonSerializable,
      stateJsonTrusted: false,
      notifyApplied: [{ op: "replace", path: "", value: nonSerializable }],
    });
    expect(planJSONRootReplacement({
      next: nonSerializable,
      schemaOutputJsonTrusted: true,
    })).toMatchObject({
      stateJsonTrusted: true,
    });
  });

  test("plans root replacement parse results before applying state changes", () => {
    const Schema = z.object({ title: z.string() });
    const parsed = Schema.safeParse({ title: "loaded" });

    expect(planJSONRootReplacementParse({
      result: parsed,
      schemaOutputJsonTrusted: false,
    })).toEqual({
      kind: "replace",
      result: { ok: true },
      state: { title: "loaded" },
      stateJsonTrusted: true,
      notifyApplied: [{ op: "replace", path: "", value: { title: "loaded" } }],
    });

    expect(planJSONRootReplacementParse({
      result: Schema.safeParse({ title: 1 }),
      schemaOutputJsonTrusted: false,
    })).toMatchObject({
      kind: "error",
      result: {
        ok: false,
        code: "schema_violation",
      },
    });
  });

  test("plans failed commits without changing state, trust, or notifications", () => {
    const current = { items: [1] };
    const applied: JSONPatchOperation[] = [{ op: "remove", path: "/missing" }];

    expect(planJSONStateCommit({
      current,
      currentJsonTrusted: false,
      next: current,
      result: { ok: false, code: "path_not_found", pointer: "/missing" },
      applied,
      changedStateJsonTrusted: true,
    })).toEqual({
      result: { ok: false, code: "path_not_found", pointer: "/missing" },
      state: current,
      stateJsonTrusted: false,
      notifyApplied: null,
    });
  });

  test("can mark a successful no-op validated patch as trusted without notifying", () => {
    const current = { title: "draft" };

    expect(planJSONStateCommit({
      current,
      currentJsonTrusted: false,
      next: current,
      result: { ok: true },
      applied: [],
      unchangedStateJsonTrusted: true,
      changedStateJsonTrusted: true,
    })).toEqual({
      result: { ok: true },
      state: current,
      stateJsonTrusted: true,
      notifyApplied: null,
    });
  });

  test("keeps trust unchanged for successful no-op accepted patches", () => {
    const current = { title: "draft" };

    expect(planJSONStateCommit({
      current,
      currentJsonTrusted: false,
      next: current,
      result: { ok: true },
      applied: [],
      changedStateJsonTrusted: true,
    })).toEqual({
      result: { ok: true },
      state: current,
      stateJsonTrusted: false,
      notifyApplied: null,
    });
  });

  test("plans changed state with the applied patch notification", () => {
    const current = { title: "draft" };
    const next = { title: "final" };
    const applied: JSONPatchOperation[] = [{ op: "replace", path: "/title", value: "final" }];

    expect(planJSONStateCommit({
      current,
      currentJsonTrusted: false,
      next,
      result: { ok: true },
      applied,
      changedStateJsonTrusted: true,
    })).toEqual({
      result: { ok: true },
      state: next,
      stateJsonTrusted: true,
      notifyApplied: applied,
    });
  });
});
