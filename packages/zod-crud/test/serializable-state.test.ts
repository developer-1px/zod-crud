import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  createJsonCrudState,
  deserialize,
  dispatchJsonCrudCommand,
  type JsonCrudCommand,
  type JsonCrudEvent,
  type JsonCrudState,
} from "../src/index.js";

describe("serializable JsonCrud state", () => {
  it("creates initial state that round-trips through JSON", () => {
    const state = createJsonCrudState(z.object({
      title: z.string(),
      tags: z.array(z.string()),
    }), {
      title: "Draft",
      tags: ["docs"],
    });

    const roundTripped = JSON.parse(JSON.stringify(state)) as JsonCrudState;

    expect(roundTripped).toEqual(state);
    expect(roundTripped.clipboard).toEqual({
      mode: "empty",
      values: [],
      sourceIds: null,
    });
    expect(roundTripped.history).toEqual({
      localUndo: [],
      localRedo: [],
      appliedEvents: [],
    });
  });

  it("models commands and events as JSON-compatible data", () => {
    const command: JsonCrudCommand = {
      type: "create",
      parentId: "n2",
      key: 0,
      value: { kind: "provided", value: "docs" },
    };
    const event: JsonCrudEvent = {
      id: "event-1",
      actorId: "actor-1",
      command,
      changes: [],
      inverseChanges: [],
      beforeRevision: 1,
      afterRevision: 2,
      timestamp: 1_769_999_999_000,
    };

    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it("dispatches a document command without mutating the input state", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const state = createJsonCrudState(schema, { tags: [] });
    const tagsId = Object.values(state.doc.nodes).find((node) => node.key === "tags")?.id;

    if (tagsId === undefined) throw new Error("tags node not found");

    const dispatched = dispatchJsonCrudCommand(state, {
      type: "create",
      parentId: tagsId,
      key: 0,
      value: { kind: "provided", value: "docs" },
    }, {
      schema,
      childKeys: ["children"],
    });

    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) throw new Error(dispatched.result.reason);
    expect(deserialize(state.doc)).toEqual({ tags: [] });
    expect(deserialize(dispatched.state.doc)).toEqual({ tags: ["docs"] });
    expect(dispatched.event?.inverseChanges).toHaveLength(dispatched.event?.changes.length ?? 0);
    expect(dispatched.state.history.localUndo).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(dispatched.state))).toEqual(dispatched.state);
  });

  it("undoes a local event by applying inverse changes", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const state = createJsonCrudState(schema, { tags: ["docs"] });
    const tagsId = Object.values(state.doc.nodes).find((node) => node.key === "tags")?.id;

    if (tagsId === undefined) throw new Error("tags node not found");

    const deleted = dispatchJsonCrudCommand(state, {
      type: "delete",
      nodeId: state.doc.nodes[tagsId]!.children[0]!,
    }, {
      schema,
      childKeys: ["children"],
    });

    if (!deleted.ok) throw new Error(deleted.result.reason);

    const undone = dispatchJsonCrudCommand(deleted.state, {
      type: "undo",
      actorId: null,
    }, {
      schema,
      childKeys: ["children"],
    });

    expect(undone.ok).toBe(true);
    expect(deserialize(undone.state.doc)).toEqual({ tags: ["docs"] });
    expect(undone.state.history.localUndo).toHaveLength(0);
    expect(undone.state.history.localRedo).toHaveLength(1);
  });

  it("keeps dispatch failures serializable", () => {
    const schema = z.object({ count: z.number() });
    const state = createJsonCrudState(schema, { count: 1 });
    const countId = Object.values(state.doc.nodes).find((node) => node.key === "count")?.id;

    if (countId === undefined) throw new Error("count node not found");

    const failed = dispatchJsonCrudCommand(state, {
      type: "update",
      nodeId: countId,
      value: "not a number",
    }, {
      schema,
      childKeys: ["children"],
    });

    expect(failed.ok).toBe(false);
    if (failed.ok) throw new Error("expected failure");
    expect("error" in failed.result).toBe(false);
    expect(JSON.parse(JSON.stringify(failed))).toEqual(failed);
  });
});
