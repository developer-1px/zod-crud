import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import type { SelectionSnap } from "../../../domain/selection/snap.js";
import { resetDocumentHistoryRuntimeState } from "../history/state.js";
import type {
  DocumentHistoryRuntimeState,
} from "../history/state.js";
import type {
  JSONChangeMetadata,
} from "../history/metadata.js";
import type { TrustedJSONStateOps } from "./json.js";
import type { DocumentPatchRuntimeState } from "./runtime.js";

export interface JSONStateOps<T> {
  add(path: Pointer, value: unknown): JSONResult;
  remove(path: Pointer): JSONResult;
  replace(path: Pointer, value: unknown): JSONResult;
  move(from: Pointer, path: Pointer): JSONResult;
  copy(from: Pointer, path: Pointer): JSONResult;
  test(path: Pointer, value: unknown): JSONResult;

  patch(operations: ReadonlyArray<JSONPatchOperation>, metadata?: JSONChangeMetadata): JSONResult;

  load(value: unknown, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: unknown): JSONResult;

  subscribe(listener: (
    applied: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
  ) => void): () => void;
  readonly state: T;
}

interface DocumentMutationOps {
  applyDocumentPatch(
    operations: ReadonlyArray<JSONPatchOperation>,
    metadata?: JSONChangeMetadata,
    operationsOwned?: boolean,
  ): JSONResult;
}

interface CreateDocumentStateOpsInput<T> {
  rawOps: TrustedJSONStateOps<T>;
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
