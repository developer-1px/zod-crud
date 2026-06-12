import type { JSONPatchOperation } from "../../../foundation/patch/contract.js";

export interface DocumentPatchRuntimeState {
  lastPatch: ReadonlyArray<JSONPatchOperation>;
  documentSubscriberCount: number;
}

export function createDocumentPatchRuntimeState(): DocumentPatchRuntimeState {
  return {
    lastPatch: [],
    documentSubscriberCount: 0,
  };
}
