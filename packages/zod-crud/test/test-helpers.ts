import * as z from "zod";

import {
  createJsonCrud,
  type JsonCrud,
  type JsonValue,
} from "../src/index.js";

export type UiNode =
  | {
      kind: "frame";
      name: string;
      children: UiNode[];
    }
  | {
      kind: "text";
      text: string;
    };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const UiNodeSchema: z.ZodType<UiNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("frame"),
      name: z.string(),
      children: z.array(UiNodeSchema),
    }),
    z.object({
      kind: z.literal("text"),
      text: z.string(),
    }),
  ]),
);

export function createEditor(): JsonCrud<UiNode> {
  return createJsonCrud(UiNodeSchema, {
    kind: "frame",
    name: "root",
    children: [{ kind: "text", text: "hello" }],
  });
}
