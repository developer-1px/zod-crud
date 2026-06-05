import type { JSONDocument } from "zod-crud";
import { convertType } from "./operations.js";
import { canConvertType } from "./plan.js";
import type { ConvertType } from "./types.js";

export function createConvertType<TDocument>(doc: JSONDocument<TDocument>): ConvertType<TDocument> {
  return {
    canConvertType: (pointer, to) => canConvertType(doc, pointer, to),
    convertType: (pointer, to) => convertType(doc, pointer, to),
  };
}
