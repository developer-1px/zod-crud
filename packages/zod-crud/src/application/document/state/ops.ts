import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import type { SelectionSnap } from "../../../domain/selection/types.js";
import { resetDocumentHistoryRuntimeState } from "../history/state.js";
import type {
  DocumentHistoryRuntimeState,
  JSONChangeMetadata,
} from "../history/types.js";
import type {
  DocumentPatchRuntimeState,
  JSONStateOps,
  TrustedDocumentStateOps,
} from "./types.js";

interface DocumentMutationOps {
  applyDocumentPatch(
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
    operationsOwned?: boolean,
  ): JSONResult;
}

interface CreateDocumentStateOpsInput<T> {
  rawOps: TrustedDocumentStateOps<T>;
  mutation: DocumentMutationOps;
  historyState: DocumentHistoryRuntimeState;
  patchState: DocumentPatchRuntimeState;
  snapSelection: () => SelectionSnap;
  syncLastPatch: () => void;
}

export function createDocumentStateOps<T>(
  input: CreateDocumentStateOpsInput<T>,
): JSONStateOps<T> {
  const { rawOps, mutation, historyState, patchState, snapSelection, syncLastPatch } = input;

  return {
    add: (path, value) => mutation.applyDocumentPatch([{ op: "add", path, value }], undefined, true),
    remove: (path) => mutation.applyDocumentPatch([{ op: "remove", path }], undefined, true),
    replace: (path, value) => mutation.applyDocumentPatch([{ op: "replace", path, value }], undefined, true),
    move: (from, path) => mutation.applyDocumentPatch([{ op: "move", from, path }], undefined, true),
    copy: (from, path) => mutation.applyDocumentPatch([{ op: "copy", from, path }], undefined, true),
    test: rawOps.test,
    patch: mutation.applyDocumentPatch,
    load(value, loadOptions?: { preserveHistory?: boolean }) {
      const r = rawOps.load(value);
      if (r.ok) {
        syncLastPatch();
        if (loadOptions?.preserveHistory !== true) resetDocumentHistoryRuntimeState(historyState);
      }
      return r;
    },
    reset(value) {
      const r = rawOps.reset(value);
      if (r.ok) {
        syncLastPatch();
        resetDocumentHistoryRuntimeState(historyState);
      }
      return r;
    },
    subscribe(listener) {
      patchState.documentSubscriberCount += 1;
      const unsubscribe = rawOps.subscribe((applied, metadata) => {
        patchState.lastPatch = applied;
        listener(applied, {
          ...metadata,
          selectionAfter: metadata?.selectionAfter ?? snapSelection(),
        });
      });
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        patchState.documentSubscriberCount = Math.max(0, patchState.documentSubscriberCount - 1);
        subscribed = false;
        unsubscribe();
      };
    },
    get state() { return rawOps.state; },
  };
}
