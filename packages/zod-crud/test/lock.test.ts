import { describe, expect, it } from "vitest";

import { createEditor } from "./test-helpers.js";

function firstTextChild(crud: ReturnType<typeof createEditor>) {
  const root = crud.snapshot().rootId;
  const childrenArrayId = crud.find(root, "children")!;
  const firstId = crud.find(childrenArrayId, 0)!;
  return { root, childrenArrayId, firstId };
}

describe("locked regions", () => {
  it("isLocked returns false for unlocked nodes", () => {
    const crud = createEditor();
    expect(crud.isLocked(crud.snapshot().rootId)).toBe(false);
  });

  it("lock then isLocked returns true", () => {
    const crud = createEditor();
    const root = crud.snapshot().rootId;
    crud.lock(root);
    expect(crud.isLocked(root)).toBe(true);
  });

  it("isLocked is true for descendants of locked node", () => {
    const crud = createEditor();
    const { root, firstId } = firstTextChild(crud);
    crud.lock(root);
    expect(crud.isLocked(firstId)).toBe(true);
  });

  it("mutation on locked node returns locked_region failure", () => {
    const crud = createEditor();
    const { firstId } = firstTextChild(crud);
    crud.lock(firstId);

    const result = crud.update(firstId, { kind: "text", text: "blocked" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("locked_region");
  });

  it("mutation on descendant of locked node returns locked_region", () => {
    const crud = createEditor();
    const { root, firstId } = firstTextChild(crud);
    crud.lock(root);

    const result = crud.update(firstId, { kind: "text", text: "blocked" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("locked_region");
  });

  it("unlock restores mutability", () => {
    const crud = createEditor();
    const { firstId } = firstTextChild(crud);
    crud.lock(firstId);
    crud.unlock(firstId);

    const result = crud.update(firstId, { kind: "text", text: "ok now" });
    expect(result.ok).toBe(true);
  });

  it("can* preflight also rejects locked", () => {
    const crud = createEditor();
    const { firstId } = firstTextChild(crud);
    crud.lock(firstId);

    const result = crud.canUpdate(firstId, { kind: "text", text: "x" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("locked_region");
  });

  it("delete of locked node fails", () => {
    const crud = createEditor();
    const { firstId } = firstTextChild(crud);
    crud.lock(firstId);

    const result = crud.delete(firstId);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("locked_region");
  });

  it("paste into locked target fails", () => {
    const crud = createEditor();
    const { root, childrenArrayId, firstId } = firstTextChild(crud);
    crud.copy(firstId);
    crud.lock(childrenArrayId);

    const result = crud.paste(childrenArrayId);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe("locked_region");
    void root;
  });

  it("unrelated mutation succeeds when sibling is locked", () => {
    const crud = createEditor();
    const { root, childrenArrayId } = firstTextChild(crud);
    crud.appendChild(childrenArrayId, { kind: "text", text: "second" });
    const docNow = crud.snapshot();
    const childrenChildren = docNow.nodes[childrenArrayId]!.children;
    const [firstChild, secondChild] = childrenChildren;
    crud.lock(firstChild!);

    const result = crud.update(secondChild!, { kind: "text", text: "edited" });
    expect(result.ok).toBe(true);
    void root;
  });
});
