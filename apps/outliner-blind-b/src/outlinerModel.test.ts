import { describe, expect, it } from "vitest";
import { createJSONDocument } from "zod-crud";
import {
  addChild,
  addSibling,
  demote,
  duplicateNode,
  flattenOutline,
  initialOutline,
  moveDown,
  moveUp,
  OutlineSchema,
  promote,
  updateNodeText,
} from "./outlinerModel";

describe("outliner model", () => {
  it("edits, inserts, moves, duplicates, and uses history", () => {
    const doc = createJSONDocument(OutlineSchema, initialOutline, { history: 20, selection: true });

    updateNodeText(doc, "/nodes/0", "Plan edited");
    expect(doc.value.nodes[0]?.text).toBe("Plan edited");

    addChild(doc, "/nodes/0");
    expect(doc.value.nodes[0]?.children.at(-1)?.text).toBe("New");

    const rows = flattenOutline(doc.value.nodes);
    const review = rows.find((row) => row.node.id === "n3");
    expect(review).toBeDefined();
    if (!review) return;

    moveUp(doc, review);
    expect(doc.value.nodes[0]?.children[0]?.id).toBe("n3");

    moveDown(doc, flattenOutline(doc.value.nodes)[1]!);
    expect(doc.value.nodes[0]?.children[1]?.id).toBe("n3");

    demote(doc, flattenOutline(doc.value.nodes)[2]!);
    expect(doc.value.nodes[0]?.children[0]?.children[0]?.id).toBe("n3");

    promote(doc, flattenOutline(doc.value.nodes)[2]!);
    expect(doc.value.nodes[0]?.children[1]?.id).toBe("n3");

    duplicateNode(doc, "/nodes/0/children/1");
    expect(doc.value.nodes[0]?.children[2]?.text).toBe("Review");
    expect(doc.value.nodes[0]?.children[2]?.id).not.toBe("n3");

    expect(doc.canUndo().ok).toBe(true);
    doc.history.undo();
    expect(doc.value.nodes[0]?.children[2]?.text).not.toBe("Review");
  });

  it("adds siblings at the selected level", () => {
    const doc = createJSONDocument(OutlineSchema, initialOutline, { history: 20, selection: true });
    const first = flattenOutline(doc.value.nodes)[0]!;

    const pointer = addSibling(doc, first);

    expect(pointer).toBe("/nodes/1");
    expect(doc.value.nodes[1]?.text).toBe("New");
  });
});
