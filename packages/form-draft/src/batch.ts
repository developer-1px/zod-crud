import type {
  JSONDocument,
  JSONPatchOperation,
  Pointer,
} from "zod-crud";

import {
  capabilityError,
  readError,
} from "./errors.js";
import {
  cloneJson,
} from "./json.js";
import {
  copySnapshot,
  readSnapshot,
} from "./snapshot.js";
import type {
  FormDraftBatchResult,
  FormDraftError,
  FormDraftParser,
  FormDraftSnapshot,
  StoredDraft,
} from "./types.js";

export function canCommitBatch<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  drafts: ReadonlyMap<Pointer, StoredDraft<TInput>>,
  parse: FormDraftParser<TInput>,
  root: Pointer,
): FormDraftBatchResult<TInput> {
  const batch = readBatch(doc, drafts, parse, root);
  if (!batch.ok) return batch;

  for (const snapshot of batch.snapshots) {
    if (snapshot.error !== null) return snapshot.error;
  }

  const operations = batch.snapshots
    .filter((snapshot) => snapshot.dirty)
    .map((snapshot): JSONPatchOperation => ({
      op: "replace",
      path: snapshot.pointer,
      value: cloneJson(snapshot.parsed),
    }));
  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError("commit_rejected", root, capability);
  }

  return {
    ok: true,
    root,
    snapshots: batch.snapshots.map(copySnapshot),
    operations,
  };
}

export function readBatch<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  drafts: ReadonlyMap<Pointer, StoredDraft<TInput>>,
  parse: FormDraftParser<TInput>,
  root: Pointer,
): { ok: true; snapshots: ReadonlyArray<FormDraftSnapshot<TInput>> } | FormDraftError {
  const readable = doc.at(root);
  if (!readable.ok) return readError(readable.code, readable.pointer, readable.reason);

  const snapshots: FormDraftSnapshot<TInput>[] = [];
  for (const draft of [...drafts.values()].sort((left, right) => left.pointer.localeCompare(right.pointer))) {
    if (!isInScope(draft.pointer, readable.path)) continue;
    const snapshot = readSnapshot(doc, draft, parse);
    if (!snapshot.ok) return snapshot;
    snapshots.push(snapshot.snapshot);
  }

  return { ok: true, snapshots };
}

function isInScope(pointer: Pointer, root: Pointer): boolean {
  return root === "" || pointer === root || pointer.startsWith(`${root}/`);
}
