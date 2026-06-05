import {
  copyChange,
} from "./copy.js";
import type {
  ProposedChange,
  ProposedChangeFilter,
  ProposedChangeListener,
  ProposedChangeSnapshot,
  ProposedChangeState,
} from "./types.js";

export function initialChanges(input: ReadonlyArray<ProposedChange>): ProposedChangeState {
  const changes = new Map<string, ProposedChange>();
  for (const change of input) {
    changes.set(change.id, copyChange(change));
  }
  return {
    nextId: nextChangeNumber(changes),
    changes,
  };
}

export function nextChangeId(state: ProposedChangeState): string {
  const id = `change-${state.nextId}`;
  state.nextId += 1;
  return id;
}

export function snapshot(
  changes: ReadonlyMap<string, ProposedChange>,
  filter: ProposedChangeFilter = {},
): ProposedChangeSnapshot {
  const status = filter.status ?? "open";
  const list = [...changes.values()];
  const filtered = status === "all"
    ? list
    : list.filter((change) => change.status === status);

  return {
    changes: filtered.map(copyChange),
    open: list.filter((change) => change.status === "open").length,
    accepted: list.filter((change) => change.status === "accepted").length,
    rejected: list.filter((change) => change.status === "rejected").length,
  };
}

export function snapshotSignature(changes: ReadonlyMap<string, ProposedChange>): string {
  return JSON.stringify([...changes.values()].map(copyChange));
}

export function emit(
  listeners: ReadonlySet<ProposedChangeListener>,
  snapshotValue: ProposedChangeSnapshot,
): void {
  for (const listener of listeners) listener(snapshotValue);
}

function nextChangeNumber(changes: ReadonlyMap<string, ProposedChange>): number {
  let next = 1;
  for (const id of changes.keys()) {
    const match = /^change-(\d+)$/.exec(id);
    if (match === null) continue;
    const value = Number.parseInt(match[1]!, 10);
    if (Number.isSafeInteger(value) && value >= next) next = value + 1;
  }
  return next;
}
