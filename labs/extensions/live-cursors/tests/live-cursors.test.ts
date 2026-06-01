import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import { createLiveCursors } from "../src/index.js";

const Block = z.object({
  id: z.string(),
  text: z.string(),
});

const Schema = z.object({
  blocks: z.array(Block),
});

function createDoc() {
  return createJSONDocument(Schema, {
    blocks: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
      { id: "c", text: "Gamma" },
    ],
  });
}

describe("@zod-crud/live-cursors", () => {
  test("stores remote cursor selections with host-owned metadata", () => {
    const doc = createDoc();
    const presence = createLiveCursors(doc);

    expect(presence.canUpsert({
      peerId: "ada",
      label: "Ada",
      color: "#00f",
      selection: [{ anchor: "/blocks/1/text", focus: "/blocks/1/text" }],
      data: { role: "reviewer" },
    })).toEqual({ ok: true });

    expect(presence.upsert({
      peerId: "ada",
      label: "Ada",
      color: "#00f",
      selection: [{ anchor: "/blocks/1/text", focus: "/blocks/1/text" }],
      data: { role: "reviewer" },
    })).toEqual({
      ok: true,
      cursor: {
        peerId: "ada",
        label: "Ada",
        color: "#00f",
        selection: [{ anchor: "/blocks/1/text", focus: "/blocks/1/text" }],
        primaryPointer: "/blocks/1/text",
        lost: false,
        data: { role: "reviewer" },
      },
    });

    expect(presence.current()).toEqual({
      cursors: [
        {
          peerId: "ada",
          label: "Ada",
          color: "#00f",
          selection: [{ anchor: "/blocks/1/text", focus: "/blocks/1/text" }],
          primaryPointer: "/blocks/1/text",
          lost: false,
          data: { role: "reviewer" },
        },
      ],
      active: 1,
      lost: 0,
    });
  });

  test("validates incoming remote selections against the document", () => {
    const doc = createDoc();
    const presence = createLiveCursors(doc);

    expect(presence.upsert({
      peerId: "",
      selection: [{ anchor: "/blocks/0", focus: "/blocks/0" }],
    })).toEqual({ ok: false, code: "empty_peer_id" });

    expect(presence.upsert({
      peerId: "ada",
      selection: [],
    })).toEqual({ ok: false, code: "empty_selection", peerId: "ada" });

    expect(presence.upsert({
      peerId: "ada",
      selection: [{ anchor: "blocks/0", focus: "/blocks/0" }],
    })).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      peerId: "ada",
      pointer: "blocks/0",
    });

    expect(presence.upsert({
      peerId: "ada",
      selection: [{ anchor: "/blocks/9", focus: "/blocks/9" }],
    })).toMatchObject({
      ok: false,
      code: "path_not_found",
      peerId: "ada",
      pointer: "/blocks/9",
    });
  });

  test("tracks remote cursors across local structural edits", () => {
    const doc = createDoc();
    const presence = createLiveCursors(doc);

    presence.upsert({
      peerId: "ada",
      selection: [{ anchor: "/blocks/1/text", focus: "/blocks/1/text" }],
    });

    expect(doc.insert("/blocks/0", { id: "x", text: "Intro" })).toEqual({ ok: true });
    expect(presence.byPeer("ada")).toMatchObject({
      selection: [{ anchor: "/blocks/2/text", focus: "/blocks/2/text" }],
      primaryPointer: "/blocks/2/text",
      lost: false,
    });

    expect(doc.delete("/blocks/0")).toEqual({ ok: true });
    expect(presence.byPeer("ada")).toMatchObject({
      selection: [{ anchor: "/blocks/1/text", focus: "/blocks/1/text" }],
      primaryPointer: "/blocks/1/text",
      lost: false,
    });

    expect(doc.move("/blocks/1", "/blocks/-")).toEqual({ ok: true });
    expect(presence.byPeer("ada")).toMatchObject({
      selection: [{ anchor: "/blocks/2/text", focus: "/blocks/2/text" }],
      primaryPointer: "/blocks/2/text",
      lost: false,
    });
  });

  test("preserves point offsets and marks lost selections when anchors disappear", () => {
    const doc = createDoc();
    const presence = createLiveCursors(doc);
    const listener = vi.fn();

    presence.subscribe(listener);
    presence.upsert({
      peerId: "ada",
      selection: [{
        anchor: { path: "/blocks/1/text", offset: 1, affinity: "forward" },
        focus: { path: "/blocks/1/text", offset: 3, edge: "after" },
      }],
    });

    expect(doc.insert("/blocks/0", { id: "x", text: "Intro" })).toEqual({ ok: true });
    expect(presence.byPeer("ada")).toMatchObject({
      selection: [{
        anchor: { path: "/blocks/2/text", offset: 1, affinity: "forward" },
        focus: { path: "/blocks/2/text", offset: 3, edge: "after" },
      }],
      primaryPointer: "/blocks/2/text",
      lost: false,
    });

    expect(doc.delete("/blocks/2")).toEqual({ ok: true });
    expect(presence.byPeer("ada")).toEqual({
      peerId: "ada",
      selection: [],
      primaryPointer: null,
      lost: true,
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("updates and removes host-owned cursor fields without touching document state", () => {
    const doc = createDoc();
    const presence = createLiveCursors(doc);

    presence.upsert({
      peerId: "ada",
      label: "Ada",
      color: "#00f",
      selection: [{ anchor: "/blocks/0", focus: "/blocks/0" }],
      data: { role: "writer" },
    });

    expect(presence.update("ada", {
      label: "Ada Lovelace",
      color: null,
      selection: [{ anchor: "/blocks/2/text", focus: "/blocks/2/text" }],
      data: null,
    })).toEqual({
      ok: true,
      cursor: {
        peerId: "ada",
        label: "Ada Lovelace",
        selection: [{ anchor: "/blocks/2/text", focus: "/blocks/2/text" }],
        primaryPointer: "/blocks/2/text",
        lost: false,
      },
    });
    expect(doc.at("/blocks/2/text")).toEqual({
      ok: true,
      path: "/blocks/2/text",
      value: "Gamma",
    });
    expect(presence.update("missing", { label: "Missing" })).toEqual({
      ok: false,
      code: "not_found",
      peerId: "missing",
    });
    expect(presence.remove("ada")).toBe(true);
    expect(presence.current()).toEqual({ cursors: [], active: 0, lost: 0 });
  });

  test("dispose stops patch-driven tracking", () => {
    const doc = createDoc();
    const presence = createLiveCursors(doc);
    const listener = vi.fn();

    presence.upsert({
      peerId: "ada",
      selection: [{ anchor: "/blocks/1", focus: "/blocks/1" }],
    });
    presence.subscribe(listener);
    presence.dispose();

    expect(doc.insert("/blocks/0", { id: "x", text: "Intro" })).toEqual({ ok: true });
    expect(presence.byPeer("ada")).toMatchObject({
      selection: [{ anchor: "/blocks/1", focus: "/blocks/1" }],
      primaryPointer: "/blocks/1",
      lost: false,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
