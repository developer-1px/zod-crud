import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  createLayerOrder,
  reorderLayers,
} from "../src/index.js";

const Shape = z.object({
  id: z.string(),
  label: z.string(),
});
const Canvas = z.object({
  layers: z.array(Shape),
  groups: z.array(z.object({
    id: z.string(),
    children: z.array(Shape),
  })),
});

function createCanvas() {
  return createJSONDocument(Canvas, {
    layers: [
      { id: "background", label: "Background" },
      { id: "card", label: "Card" },
      { id: "title", label: "Title" },
      { id: "cursor", label: "Cursor" },
    ],
    groups: [
      {
        id: "g1",
        children: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
    ],
  });
}

function layerIds(doc: ReturnType<typeof createCanvas>): string[] {
  return doc.value.layers.map((layer) => layer.id);
}

describe("@zod-crud/layer-order", () => {
  test("brings a layer forward by one slot", () => {
    const doc = createCanvas();
    const order = createLayerOrder(doc);

    expect(order.canBringForward("/layers/1")).toMatchObject({
      ok: true,
      action: "bringForward",
      parent: "/layers",
      source: ["/layers/1"],
      operations: [{ op: "replace", path: "/layers" }],
    });
    expect(order.bringForward("/layers/1")).toMatchObject({
      ok: true,
      action: "bringForward",
      parent: "/layers",
      result: { ok: true },
    });
    expect(layerIds(doc)).toEqual(["background", "title", "card", "cursor"]);
  });

  test("sends a layer backward by one slot", () => {
    const doc = createCanvas();
    const order = createLayerOrder(doc);

    expect(order.sendBackward("/layers/2")).toMatchObject({
      ok: true,
      action: "sendBackward",
      result: { ok: true },
    });
    expect(layerIds(doc)).toEqual(["background", "title", "card", "cursor"]);
  });

  test("moves selected layers to front while preserving relative order", () => {
    const doc = createCanvas();
    const order = createLayerOrder(doc);

    expect(order.bringToFront(["/layers/0", "/layers/2"])).toMatchObject({
      ok: true,
      action: "bringToFront",
      source: ["/layers/0", "/layers/2"],
    });
    expect(layerIds(doc)).toEqual(["card", "cursor", "background", "title"]);
  });

  test("moves selected layers to back while preserving relative order", () => {
    const doc = createCanvas();

    expect(reorderLayers(doc, ["/layers/1", "/layers/3"], "sendToBack")).toMatchObject({
      ok: true,
      action: "sendToBack",
    });
    expect(layerIds(doc)).toEqual(["card", "cursor", "background", "title"]);
  });

  test("reports boundary no-ops as disabled changes", () => {
    const doc = createCanvas();
    const order = createLayerOrder(doc);

    expect(order.canBringForward("/layers/3")).toEqual({
      ok: false,
      code: "order_boundary",
      reason: "layer order is already satisfied for bringForward",
      pointer: "/layers/3",
      parent: "/layers",
    });
    expect(order.sendToBack(["/layers/0"])).toMatchObject({
      ok: false,
      code: "order_boundary",
      parent: "/layers",
    });
    expect(layerIds(doc)).toEqual(["background", "card", "title", "cursor"]);
  });

  test("rejects invalid, non-array, and mixed-parent sources", () => {
    const doc = createCanvas();
    const order = createLayerOrder(doc);

    expect(order.canBringForward("not/a/pointer")).toMatchObject({
      ok: false,
      code: "invalid_pointer",
    });
    expect(order.canBringForward("/layers")).toMatchObject({
      ok: false,
      code: "not_layer_item",
    });
    expect(order.canBringForward(["/layers/0", "/groups/0/children/0"])).toMatchObject({
      ok: false,
      code: "mixed_parent",
    });
  });
});
