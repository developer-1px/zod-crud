import type { JSONDocument } from "zod-crud";
import { convertBlockType } from "./operations.js";
import { canConvertBlockType } from "./plan.js";
import type { BlockTypeConversionDescriptor, BlockTypeConverter } from "./types.js";

export function createBlockTypeConverter<TDocument>(
  doc: JSONDocument<TDocument>,
  descriptor: BlockTypeConversionDescriptor,
): BlockTypeConverter<TDocument> {
  return {
    canConvert: (input) => canConvertBlockType(doc, descriptor, input),
    convert: (input, metadata) => convertBlockType(doc, descriptor, input, metadata),
  };
}
