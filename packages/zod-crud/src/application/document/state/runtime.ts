import type { DocumentPatchRuntimeState } from "./types.js";

export function createDocumentPatchRuntimeState(): DocumentPatchRuntimeState {
  return {
    lastPatch: [],
    documentSubscriberCount: 0,
  };
}
