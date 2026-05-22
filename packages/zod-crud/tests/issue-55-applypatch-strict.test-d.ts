import * as z from "zod";
import { applyPatch, applyPatchToTrustedState } from "../src/index.js";

const Doc = z.object({
  blocks: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string() }),
    z.object({ kind: z.literal("img"), src: z.string() }),
  ])),
});

declare const state: z.output<typeof Doc>;
applyPatch(Doc, state, []);
applyPatchToTrustedState(Doc, state, []);
