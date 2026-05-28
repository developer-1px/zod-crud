import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canCommand,
  commandState,
  createCommandState,
  listCommandStates,
  runCommand,
} from "../src/index.js";

const Card = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});
const Schema = z.object({
  title: z.string(),
  cards: z.array(Card),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft",
    cards: [
      { id: "a", title: "A", done: false },
    ],
  }, {
    history: 20,
    selection: true,
  });
}

describe("@zod-crud/command-state", () => {
  test("reports command state from public can methods", () => {
    const doc = createDoc();
    const commands = createCommandState(doc);

    expect(commands.state({ id: "undo", label: "Undo", shortcut: "Mod+Z" })).toMatchObject({
      id: "undo",
      label: "Undo",
      shortcut: "Mod+Z",
      enabled: false,
      capability: {
        ok: false,
        code: "empty_stack",
      },
    });

    expect(commands.state({
      id: "replace",
      args: { path: "/title", value: "Next" },
    })).toMatchObject({
      id: "replace",
      enabled: true,
      capability: { ok: true },
    });
  });

  test("runs replace and undo commands", () => {
    const doc = createDoc();
    const commands = createCommandState(doc);

    expect(commands.run("replace", { path: "/title", value: "Next" })).toMatchObject({
      ok: true,
      id: "replace",
      result: { ok: true },
    });
    expect(doc.value.title).toBe("Next");
    expect(commands.run("undo")).toMatchObject({
      ok: true,
      id: "undo",
      result: true,
    });
    expect(doc.value.title).toBe("Draft");
  });

  test("supports direct payload paste command state", () => {
    const doc = createDoc();
    const commands = createCommandState(doc);
    const card = { id: "b", title: "B", done: false };

    expect(commands.can("paste", {
      target: "/cards/-",
      options: { payload: card },
    })).toEqual({ ok: true });
    expect(commands.run("paste", {
      target: "/cards/-",
      options: { payload: card },
    })).toMatchObject({
      ok: true,
      id: "paste",
    });
    expect(doc.value.cards.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("keeps disabled reasons from capability checks", () => {
    const doc = createDoc();

    expect(canCommand(doc, "replace", { path: "/cards/0/done", value: "no" })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(runCommand(doc, "replace", { path: "/cards/0/done", value: "no" })).toMatchObject({
      ok: false,
      id: "replace",
      code: "disabled",
      capability: {
        ok: false,
        code: "schema_violation",
      },
    });
    expect(doc.value.cards[0]?.done).toBe(false);
  });

  test("reports invalid args without touching document state", () => {
    const doc = createDoc();

    expect(commandState(doc, { id: "insert", args: { path: "/cards/-" } })).toMatchObject({
      id: "insert",
      enabled: false,
      capability: {
        ok: false,
        code: "invalid_args",
      },
    });
    expect(runCommand(doc, "move", { source: "/cards/0" })).toMatchObject({
      ok: false,
      id: "move",
      code: "invalid_args",
    });
    expect(doc.value.cards).toHaveLength(1);
  });

  test("lists host-owned command specs", () => {
    const doc = createDoc();

    expect(listCommandStates(doc, [
      { id: "find", label: "Find done cards", args: { jsonPath: "$.cards[?(@.done==true)]" } },
      { id: "delete", label: "Delete selection" },
      { id: "paste", label: "Paste card", args: { target: "/cards/-", options: { payload: { id: "b", title: "B", done: false } } } },
    ])).toMatchObject([
      {
        id: "find",
        label: "Find done cards",
        enabled: true,
      },
      {
        id: "delete",
        label: "Delete selection",
        enabled: false,
      },
      {
        id: "paste",
        label: "Paste card",
        enabled: true,
      },
    ]);
  });

  test("runs read commands without mutation", () => {
    const doc = createDoc();

    expect(runCommand(doc, "find", { jsonPath: "$.cards[*].title" })).toMatchObject({
      ok: true,
      id: "find",
      result: {
        ok: true,
        pointers: ["/cards/0/title"],
      },
    });
    expect(doc.lastPatch).toEqual([]);
  });
});
