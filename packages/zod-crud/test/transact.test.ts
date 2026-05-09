import { describe, expect, it } from "vitest";

import { createEditor } from "./test-helpers.js";

describe("transact", () => {
  it("commits multiple ops as a single history entry", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const childrenArrayId = crud.find(root, "children")!;

    const before = crud.toJson();
    let notifyCount = 0;
    crud.subscribe(() => { notifyCount += 1; });

    const result = crud.transact((tx) => {
      tx.appendChild(childrenArrayId, { kind: "text", text: "a" });
      tx.appendChild(childrenArrayId, { kind: "text", text: "b" });
      tx.appendChild(childrenArrayId, { kind: "text", text: "c" });
      return "done" as const;
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.value).toBe("done");
    expect(notifyCount).toBe(1);

    const undoResult = crud.undo();
    expect(undoResult.ok).toBe(true);
    expect(crud.toJson()).toEqual(before);
  });

  it("rolls back on op failure inside fn", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const childrenArrayId = crud.find(root, "children")!;
    const before = crud.toJson();

    const result = crud.transact((tx) => {
      tx.appendChild(childrenArrayId, { kind: "text", text: "a" });
      // Trying to update root with invalid value → failure → throw inside strict() → caught.
      tx.update(root, "not a frame" as never);
      return "should not reach";
    });

    expect(result.ok).toBe(false);
    expect(crud.toJson()).toEqual(before);
  });

  it("rolls back on user-thrown error", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const childrenArrayId = crud.find(root, "children")!;
    const before = crud.toJson();

    const result = crud.transact((_tx) => {
      _tx.appendChild(childrenArrayId, { kind: "text", text: "x" });
      throw new Error("user abort");
    });

    expect(result.ok).toBe(false);
    expect(crud.toJson()).toEqual(before);
  });

  it("returns value from fn on success", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const childrenArrayId = crud.find(root, "children")!;

    const result = crud.transact((tx) => {
      const r = tx.appendChild(childrenArrayId, { kind: "text", text: "xyz" });
      return r.ok ? r.nodeId : null;
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.value).toBeDefined();
  });

  it("noop transaction does not commit", () => {
    const crud = createEditor();
    const before = crud.toJson();
    let notifyCount = 0;
    crud.subscribe(() => { notifyCount += 1; });

    const result = crud.transact(() => 42);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.value).toBe(42);
    expect(notifyCount).toBe(0);
    expect(crud.toJson()).toEqual(before);
  });

  it("locked region inside transaction aborts", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const childrenArrayId = crud.find(root, "children")!;
    crud.lock(childrenArrayId);
    const before = crud.toJson();

    const result = crud.transact((tx) => {
      tx.appendChild(childrenArrayId, { kind: "text", text: "blocked" });
      return "x";
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("locked_region");
    expect(crud.toJson()).toEqual(before);
  });
});

describe("insertableKeys / insertableTypes", () => {
  it("insertableKeys excludes existing children of object", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const keys = crud.insertableKeys(root);
    // root is frame {kind, name, children} — all 3 keys exist.
    expect(keys).toEqual([]);
  });

  it("insertableTypes for array element returns object (UiNode union)", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const childrenArrayId = crud.find(root, "children")!;
    const types = crud.insertableTypes(childrenArrayId);
    // UiNode union — frame is object, text is object → ["object"]
    expect(types).toContain("object");
  });

  it("insertableTypes for object key returns expected type", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    const types = crud.insertableTypes(root, "name");
    // name: z.string() in frame branch
    expect(types).toContain("string");
  });
});
