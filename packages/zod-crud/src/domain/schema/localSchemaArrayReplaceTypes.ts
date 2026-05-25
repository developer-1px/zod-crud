import type { AppliedReplaceValueValidationOperation } from "./localSchemaValueValidation.js";

export interface IndexedReplaceValueValidationOperation extends AppliedReplaceValueValidationOperation {
  index: number;
}
