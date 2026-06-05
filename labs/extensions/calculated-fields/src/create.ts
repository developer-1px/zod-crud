import type { JSONDocument } from "zod-crud";
import { syncCalculatedFields } from "./operations.js";
import { planCalculatedFields } from "./plan.js";
import type { CalculatedFieldDefinition, CalculatedFields } from "./types.js";

export function createCalculatedFields<TDocument>(
  doc: JSONDocument<TDocument>,
  fields: ReadonlyArray<CalculatedFieldDefinition<TDocument>>,
): CalculatedFields<TDocument> {
  return {
    current: () => planCalculatedFields(doc, fields),
    canSync: () => planCalculatedFields(doc, fields),
    sync: () => syncCalculatedFields(doc, fields),
  };
}
