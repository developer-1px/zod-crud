import type {
  JSONChangeMetadata,
  JSONDocument,
} from "zod-crud";

import {
  canAcceptChange,
  canCloseChange,
} from "./accept.js";
import {
  copyChange,
} from "./copy.js";
import {
  patchError,
} from "./errors.js";
import {
  canProposeChange,
  createChange,
} from "./plan.js";
import {
  emit,
  initialChanges,
  nextChangeId,
  snapshot,
  snapshotSignature,
} from "./store.js";
import type {
  ProposedChangeListener,
  ProposedChanges,
  ProposedChangesOptions,
  ProposedChangeState,
} from "./types.js";

export function createProposedChanges<TDocument>(
  doc: JSONDocument<TDocument>,
  options: ProposedChangesOptions = {},
): ProposedChanges<TDocument> {
  const initial = initialChanges(options.initial ?? []);
  const state: ProposedChangeState = {
    nextId: initial.nextId,
    changes: initial.changes,
  };
  const listeners = new Set<ProposedChangeListener>();

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(state.changes);
    if (before === after) return;
    emit(listeners, snapshot(state.changes));
  };

  return {
    current: (filter = {}) => snapshot(state.changes, filter),
    byId(id) {
      const change = state.changes.get(id);
      return change === undefined ? null : copyChange(change);
    },
    canPropose: (input) => canProposeChange(doc, state.changes, input),
    propose(input) {
      const plan = canProposeChange(doc, state.changes, input);
      if (!plan.ok) return plan;

      const before = snapshotSignature(state.changes);
      const id = input.id ?? nextChangeId(state);
      const change = createChange(id, input, plan);
      state.changes.set(id, change);
      emitIfChanged(before);
      return { ok: true, change: copyChange(change) };
    },
    canAccept: (id) => canAcceptChange(doc, state.changes, id),
    accept(id, metadata?: JSONChangeMetadata) {
      const capability = canAcceptChange(doc, state.changes, id);
      if (!capability.ok) return capability;

      const result = doc.patch(capability.change.operations, metadata);
      if (!result.ok) return patchError(id, result);

      const before = snapshotSignature(state.changes);
      const change = state.changes.get(id)!;
      change.status = "accepted";
      emitIfChanged(before);
      return { ok: true, change: copyChange(change), result };
    },
    canReject: (id) => canCloseChange(state.changes, id),
    reject(id) {
      const capability = canCloseChange(state.changes, id);
      if (!capability.ok) return capability;

      const before = snapshotSignature(state.changes);
      const change = state.changes.get(id)!;
      change.status = "rejected";
      emitIfChanged(before);
      return { ok: true, change: copyChange(change) };
    },
    load(next) {
      const before = snapshotSignature(state.changes);
      const initial = initialChanges(next);
      state.changes = initial.changes;
      state.nextId = initial.nextId;
      emitIfChanged(before);
    },
    remove(id) {
      const before = snapshotSignature(state.changes);
      const removed = state.changes.delete(id);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(state.changes);
      state.changes.clear();
      emitIfChanged(before);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
