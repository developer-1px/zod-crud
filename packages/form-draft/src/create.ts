import type {
  JSONDocument,
  JSONResult,
  Pointer,
} from "zod-crud";

import {
  canCommitBatch,
  readBatch,
} from "./batch.js";
import {
  commitFailed,
  missingDraft,
  readError,
} from "./errors.js";
import {
  emit,
} from "./events.js";
import {
  cloneJson,
} from "./json.js";
import {
  copySnapshot,
  readCommittedSnapshot,
  readSnapshot,
} from "./snapshot.js";
import type {
  CreateFormDraftOptions,
  FormDraftListener,
  FormDraftParser,
  FormDrafts,
  StoredDraft,
} from "./types.js";

export function createFormDraft<TDocument, TInput = unknown>(
  doc: JSONDocument<TDocument>,
  options: CreateFormDraftOptions<TInput> = {},
): FormDrafts<TInput> {
  const parse: FormDraftParser<TInput> = options.parse ?? ((context) => ({ ok: true, value: context.input }));
  const drafts = new Map<Pointer, StoredDraft<TInput>>();
  const listeners = new Set<FormDraftListener<TInput>>();
  let disposed = false;

  return {
    current(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return null;
      const snapshot = readSnapshot(doc, draft, parse);
      return snapshot.ok ? snapshot.snapshot : null;
    },
    currentAll(root = "") {
      const batch = readBatch(doc, drafts, parse, root);
      return batch.ok ? batch.snapshots.map(copySnapshot) : [];
    },
    set(path, input) {
      const readable = doc.at(path);
      if (!readable.ok) {
        return readError(readable.code, readable.pointer, readable.reason);
      }
      const draft: StoredDraft<TInput> = { pointer: readable.path, input: cloneJson(input) };
      drafts.set(readable.path, draft);
      const snapshot = readSnapshot(doc, draft, parse);
      if (!snapshot.ok) return snapshot;
      emit(listeners, snapshot.snapshot);
      return { ok: true, snapshot: copySnapshot(snapshot.snapshot) };
    },
    canCommit(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return missingDraft(path);
      const snapshot = readSnapshot(doc, draft, parse);
      if (!snapshot.ok) return snapshot;
      if (snapshot.snapshot.error !== null) return snapshot.snapshot.error;
      return snapshot.snapshot.capability ?? { ok: true };
    },
    commit(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return missingDraft(path);
      const snapshot = readSnapshot(doc, draft, parse);
      if (!snapshot.ok) return snapshot;
      if (snapshot.snapshot.error !== null) return snapshot.snapshot.error;

      const result = doc.replace(path, cloneJson(snapshot.snapshot.parsed));
      if (!result.ok) return commitFailed(path, result);

      drafts.delete(path);
      const committed = readCommittedSnapshot(doc, path, draft.input);
      emit(listeners, committed);
      return {
        ok: true,
        snapshot: committed,
        result,
      };
    },
    canCommitAll: (root = "") => canCommitBatch(doc, drafts, parse, root),
    commitAll(root = "") {
      const change = canCommitBatch(doc, drafts, parse, root);
      if (!change.ok) return change;

      const result: JSONResult = change.operations.length === 0
        ? { ok: true }
        : doc.patch(change.operations);
      if (!result.ok) return commitFailed(root, result);

      const committed = change.snapshots.map((snapshot) => {
        drafts.delete(snapshot.pointer);
        return readCommittedSnapshot(doc, snapshot.pointer, snapshot.input);
      });
      for (const snapshot of committed) {
        emit(listeners, snapshot);
      }

      return {
        ok: true,
        root,
        snapshots: committed.map(copySnapshot),
        operations: change.operations,
        result,
      };
    },
    reset(path) {
      const removed = drafts.delete(path);
      if (!removed) return false;
      const readable = doc.at(path);
      if (readable.ok) {
        emit(listeners, readCommittedSnapshot(doc, readable.path, readable.value as TInput));
      }
      return true;
    },
    clear: () => { drafts.clear(); },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      drafts.clear();
      listeners.clear();
    },
  };
}
