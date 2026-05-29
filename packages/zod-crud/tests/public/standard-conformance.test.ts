import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  createJSONDocument,
  type JSONPatchOperation,
  type SelectionSnap,
} from "zod-crud";

const Card = z.object({
  id: z.string(),
  title: z.string(),
});

const Board = z.object({
  columns: z.array(z.object({
    id: z.string(),
    title: z.string(),
    cards: z.array(Card),
  })),
});

type BoardValue = z.output<typeof Board>;

const initialBoard: BoardValue = {
  columns: [
    {
      id: "todo",
      title: "Todo",
      cards: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    },
    {
      id: "done",
      title: "Done",
      cards: [
        { id: "c", title: "C" },
      ],
    },
  ],
};

function createBoardDocument() {
  return createJSONDocument(Board, initialBoard, {
    strict: false,
    history: 20,
    selection: { mode: "multiple", initial: ["/columns/0/cards/0"] },
  });
}

const selectedSecondCard: SelectionSnap = {
  selectedPointers: ["/columns/0/cards/1"],
  selectionRanges: [{ anchor: "/columns/0/cards/1", focus: "/columns/0/cards/1" }],
  primaryIndex: 0,
  anchor: "/columns/0/cards/1",
  focus: "/columns/0/cards/1",
};

describe("zod-crud core standard conformance", () => {
  test("uses JSONPath for query results and JSON Pointer for mutation", () => {
    const doc = createBoardDocument();

    expect(doc.find("$.columns[*].cards[*].id")).toEqual({
      ok: true,
      query: "$.columns[*].cards[*].id",
      pointers: [
        "/columns/0/cards/0/id",
        "/columns/0/cards/1/id",
        "/columns/1/cards/0/id",
      ],
    });

    expect(doc.query("$.columns[*].cards[*].id")).toEqual({
      ok: true,
      query: "$.columns[*].cards[*].id",
      pointers: [
        "/columns/0/cards/0/id",
        "/columns/0/cards/1/id",
        "/columns/1/cards/0/id",
      ],
    });

    expect(doc.patch({
      op: "replace",
      path: "/columns/0/cards/0/title",
      value: "A1",
    })).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards[0]?.title).toBe("A1");

    const jsonPathAsMutationTarget: JSONPatchOperation = {
      op: "replace",
      path: "$.columns[0]",
      value: { id: "bad", title: "Bad", cards: [] },
    };
    expect(doc.patch(jsonPathAsMutationTarget)).toMatchObject({
      ok: false,
      code: "invalid_pointer",
    });
  });

  test("exposes muscle-memory editing verbs beside can probes", () => {
    const doc = createBoardDocument();

    expect(doc.canReplace("/columns/0/cards/0/title", "A1")).toEqual({ ok: true });
    expect(doc.replace("/columns/0/cards/0/title", "A1")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards[0]?.title).toBe("A1");

    expect(doc.canInsert("/columns/0/cards/-", { id: "c", title: "C" })).toEqual({ ok: true });
    expect(doc.insert("/columns/0/cards/-", { id: "c", title: "C" })).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);

    expect(doc.canMove("/columns/0/cards/0", "/columns/0/cards/1")).toEqual({ ok: true });
    expect(doc.move("/columns/0/cards/0", "/columns/0/cards/1")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["b", "a", "c"]);

    expect(doc.canDelete("/columns/0/cards/1")).toEqual({ ok: true });
    expect(doc.delete("/columns/0/cards/1")).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["b", "c"]);

    expect(doc.canUndo()).toEqual({ ok: true });
    expect(doc.undo()).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["b", "a", "c"]);
    expect(doc.canRedo()).toEqual({ ok: true });
    expect(doc.redo()).toEqual({ ok: true });
    expect(doc.value.columns[0]?.cards.map((card) => card.id)).toEqual(["b", "c"]);
    expect(doc.canRedo()).toEqual({ ok: false, code: "empty_stack", reason: "redo stack is empty" });
    expect(doc.redo()).toEqual({ ok: false, code: "empty_stack", reason: "redo stack is empty" });
  });

  test("keeps capability probes reasoned and mutation-free", () => {
    const doc = createBoardDocument();
    const before = doc.value;

    expect(doc.canReplace("/columns/0/cards/0/title", 1)).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(doc.value).toEqual(before);

    expect(doc.canReplace("/columns/0/cards/0/title", "A1")).toEqual({ ok: true });
    expect(doc.canUndo()).toEqual({
      ok: false,
      code: "empty_stack",
      reason: "undo stack is empty",
    });
    expect(typeof doc.canUndo()).toBe("object");
  });

  test("commits patch and final selection as one history step", () => {
    const doc = createBoardDocument();

    expect(doc.commit([{
      op: "replace",
      path: "/columns/0/cards/0/title",
      value: "A1",
    }], {
      label: "rename card",
      origin: "keyboard",
      mergeKey: "card:title",
      selection: selectedSecondCard,
    })).toEqual({ ok: true });

    expect(doc.value.columns[0]?.cards[0]?.title).toBe("A1");
    expect(doc.selection?.snapshot()).toEqual(selectedSecondCard);
    expect(JSON.parse(JSON.stringify(doc.selection?.snapshot()))).toEqual(doc.selection?.snapshot());

    expect(doc.history.undo()).toBe(true);
    expect(doc.value.columns[0]?.cards[0]?.title).toBe("A");
    expect(doc.selection?.selectedPointers).toEqual(["/columns/0/cards/0"]);

    expect(doc.history.redo()).toBe(true);
    expect(doc.value.columns[0]?.cards[0]?.title).toBe("A1");
    expect(doc.selection?.snapshot()).toEqual(selectedSecondCard);
  });

  test("keeps clipboard headless, JSON-only, and explicit about spread", () => {
    const doc = createBoardDocument();

    expect(doc.clipboard.write({ fn: () => undefined })).toMatchObject({
      ok: false,
      code: "not_serializable",
    });

    expect(doc.copy(["/columns/0/cards/0", "/columns/0/cards/1"])).toMatchObject({
      ok: true,
      sources: ["/columns/0/cards/0", "/columns/0/cards/1"],
    });
    expect(doc.paste("/columns/1/cards/-")).toMatchObject({ ok: true });
    expect(doc.value.columns[1]?.cards.map((card) => card.id)).toEqual(["c", "a", "b"]);

    const directPayloadDoc = createBoardDocument();
    expect(directPayloadDoc.paste("/columns/1/cards/-", {
      payload: [{ id: "x", title: "X" }],
    })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(directPayloadDoc.paste("/columns/1/cards/-", {
      payload: [{ id: "x", title: "X" }],
      spread: true,
    })).toMatchObject({ ok: true });
    expect(directPayloadDoc.value.columns[1]?.cards.map((card) => card.id)).toEqual(["c", "x"]);
  });

  test("notifies subscribers only after successful atomic changes", () => {
    const doc = createBoardDocument();
    const observed: Array<{
      patch: ReadonlyArray<JSONPatchOperation>;
      label: string | undefined;
    }> = [];

    doc.subscribe((patch, metadata) => {
      observed.push({ patch, label: metadata?.label });
    });

    expect(doc.patch({
      op: "replace",
      path: "/columns/0/cards/0/title",
      value: 1,
    }, { label: "invalid" })).toMatchObject({
      ok: false,
      code: "schema_violation",
    });
    expect(observed).toEqual([]);

    expect(doc.patch({
      op: "replace",
      path: "/columns/0/cards/0/title",
      value: "A1",
    }, { label: "rename card" })).toEqual({ ok: true });

    expect(observed).toEqual([{
      patch: [{
        op: "replace",
        path: "/columns/0/cards/0/title",
        value: "A1",
      }],
      label: "rename card",
    }]);
  });
});
