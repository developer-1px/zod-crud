import { describe, expect, it } from "vitest";
import * as z from "zod";

import { createJsonCrud } from "../src/index.js";
import { createEditor } from "./test-helpers.js";

describe("invertChanges / diff / applyChanges", () => {
  it("invertChanges of empty array returns empty", () => {
    const crud = createEditor();
    expect(crud.invertChanges([])).toEqual([]);
  });

  it("diff between identical doc returns empty", () => {
    const crud = createEditor();
    expect(crud.diff(crud.snapshot())).toEqual([]);
  });

  it("applyChanges of empty array succeeds with no state change", () => {
    const crud = createEditor();
    const before = crud.toJson();
    const result = crud.applyChanges([]);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual(before);
  });

  it("diff captures inserted node, applyChanges restores it", () => {
    const a = createEditor();
    const b = createEditor();
    const root = b.snapshot().rootId;
    b.appendChild(root, { kind: "text", text: "world" });

    const changes = a.diff(b.snapshot());
    expect(changes.length).toBeGreaterThan(0);

    const result = a.applyChanges(changes);
    expect(result.ok).toBe(true);
    expect(a.toJson()).toEqual(b.toJson());
  });

  it("invertChanges round-trips through applyChanges", () => {
    const crud = createEditor();
    const before = crud.toJson();

    const root = crud.snapshot().rootId;
    const inserted = crud.appendChild(root, { kind: "text", text: "world" });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok || inserted.changes === undefined) throw new Error("expected changes");

    const inverted = crud.invertChanges(inserted.changes);
    const result = crud.applyChanges(inverted);
    expect(result.ok).toBe(true);
    expect(crud.toJson()).toEqual(before);
  });

  it("applyChanges with conflicting before returns change_conflict", () => {
    const a = createEditor();
    const b = createEditor();
    const root = b.snapshot().rootId;
    b.appendChild(root, { kind: "text", text: "world" });
    const changes = a.diff(b.snapshot());

    // Apply once succeeds
    const first = a.applyChanges(changes);
    expect(first.ok).toBe(true);

    // Re-applying same insert changes should conflict (node already exists)
    const second = a.applyChanges(changes);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error();
    expect(second.code).toBe("change_conflict");
  });

  it("applyChanges commits and is reversible via undo", () => {
    const a = createEditor();
    const b = createEditor();
    const root = b.snapshot().rootId;
    b.appendChild(root, { kind: "text", text: "world" });

    const changes = a.diff(b.snapshot());
    const before = a.toJson();
    a.applyChanges(changes);
    expect(a.toJson()).toEqual(b.toJson());

    const undoResult = a.undo();
    expect(undoResult.ok).toBe(true);
    expect(a.toJson()).toEqual(before);
  });

  it("applyChanges emits a single subscribe notification with all changes", () => {
    const a = createEditor();
    const b = createEditor();
    const root = b.snapshot().rootId;
    b.appendChild(root, { kind: "text", text: "world" });
    const changes = a.diff(b.snapshot());

    let notifyCount = 0;
    let received: number | null = null;
    a.subscribe((c) => {
      notifyCount += 1;
      received = c.length;
    });

    a.applyChanges(changes);
    expect(notifyCount).toBe(1);
    expect(received).toBe(changes.length);
  });
});
