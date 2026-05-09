import type { JsonDoc } from "./types.js";
import { cloneDoc } from "./document/json-doc-clone.js";

export type DirtyTracker = {
  markClean: () => void;
  isDirty: () => boolean;
  savedSnapshot: () => JsonDoc;
};

export function createDirtyTracker(getDoc: () => JsonDoc): DirtyTracker {
  let saved: JsonDoc = cloneDoc(getDoc());
  return {
    markClean() {
      saved = cloneDoc(getDoc());
    },
    isDirty() {
      return getDoc() !== saved;
    },
    savedSnapshot() {
      return cloneDoc(saved);
    },
  };
}
