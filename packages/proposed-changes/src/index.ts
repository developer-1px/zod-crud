import {
  parentPointer,
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchInput,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ProposedChangeStatus = "open" | "accepted" | "rejected";

export type ProposedChangeErrorCode =
  | "duplicate_id"
  | "empty_patch"
  | "not_found"
  | "not_open"
  | "patch_rejected"
  | "patch_failed"
  | "stale_change";

export interface ProposedChangeGuard {
  path: Pointer;
  value: unknown;
}

export interface ProposedChange {
  id: string;
  status: ProposedChangeStatus;
  operations: ReadonlyArray<JSONPatchOperation>;
  guards: ReadonlyArray<ProposedChangeGuard>;
  label?: string;
  description?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface ProposedChangeAuditData extends Readonly<Record<string, unknown>> {
  proposedBy?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  reviewerNote?: string;
}

export interface ProposedChangeInput {
  id?: string;
  operations: JSONPatchInput;
  label?: string;
  description?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface ProposedChangeFilter {
  status?: ProposedChangeStatus | "all";
}

export interface ProposedChangeSnapshot {
  changes: ReadonlyArray<ProposedChange>;
  open: number;
  accepted: number;
  rejected: number;
}

export interface ProposedChangeError {
  ok: false;
  code: ProposedChangeErrorCode;
  reason: string;
  id?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface ProposedChangePlan {
  ok: true;
  operations: ReadonlyArray<JSONPatchOperation>;
  guards: ReadonlyArray<ProposedChangeGuard>;
}

export type ProposedChangePlanResult = ProposedChangePlan | ProposedChangeError;

export type ProposedChangeResult =
  | { ok: true; change: ProposedChange }
  | ProposedChangeError;

export type ProposedChangeAcceptResult =
  | { ok: true; change: ProposedChange; result: JSONResult }
  | ProposedChangeError;

export type ProposedChangeListener = (snapshot: ProposedChangeSnapshot) => void;

export interface ProposedChangesOptions {
  initial?: ReadonlyArray<ProposedChange>;
}

export interface ProposedChanges<TDocument> {
  current(filter?: ProposedChangeFilter): ProposedChangeSnapshot;
  byId(id: string): ProposedChange | null;
  canPropose(input: ProposedChangeInput): ProposedChangePlanResult;
  propose(input: ProposedChangeInput): ProposedChangeResult;
  canAccept(id: string): ProposedChangeResult;
  accept(id: string, metadata?: JSONChangeMetadata): ProposedChangeAcceptResult;
  canReject(id: string): ProposedChangeResult;
  reject(id: string): ProposedChangeResult;
  load(changes: ReadonlyArray<ProposedChange>): void;
  remove(id: string): boolean;
  clear(): void;
  subscribe(listener: ProposedChangeListener): () => void;
}

interface ProposedChangeState {
  nextId: number;
  changes: Map<string, ProposedChange>;
}

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
    current(filter = {}) {
      return snapshot(state.changes, filter);
    },
    byId(id) {
      const change = state.changes.get(id);
      return change === undefined ? null : copyChange(change);
    },
    canPropose(input) {
      return canProposeChange(doc, state.changes, input);
    },
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
    canAccept(id) {
      return canAcceptChange(doc, state.changes, id);
    },
    accept(id, metadata) {
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
    canReject(id) {
      return canCloseChange(state.changes, id, "reject");
    },
    reject(id) {
      const capability = canCloseChange(state.changes, id, "reject");
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

function initialChanges(input: ReadonlyArray<ProposedChange>): ProposedChangeState {
  const changes = new Map<string, ProposedChange>();
  for (const change of input) {
    changes.set(change.id, copyChange(change));
  }
  return {
    nextId: nextChangeNumber(changes),
    changes,
  };
}

export function canProposeChange<TDocument>(
  doc: JSONDocument<TDocument>,
  changes: ReadonlyMap<string, ProposedChange>,
  input: ProposedChangeInput,
): ProposedChangePlanResult {
  if (input.id !== undefined && changes.has(input.id)) {
    return proposedChangeError("duplicate_id", `proposed change already exists: ${input.id}`, { id: input.id });
  }

  const operations = toPatchArray(input.operations);
  if (operations.length === 0) {
    return proposedChangeError("empty_patch", "proposed change patch is empty", input.id === undefined ? {} : { id: input.id });
  }

  const capability = doc.canPatch(operations);
  if (!capability.ok) return capabilityError(undefined, capability);

  return {
    ok: true,
    operations: copyOperations(operations),
    guards: guardsFor(doc, operations),
  };
}

export function canAcceptChange<TDocument>(
  doc: JSONDocument<TDocument>,
  changes: ReadonlyMap<string, ProposedChange>,
  id: string,
): ProposedChangeResult {
  const change = changes.get(id);
  if (change === undefined) return notFound(id);
  if (change.status !== "open") return notOpen(id, change.status);

  const stale = staleGuard(doc, change);
  if (stale !== null) return stale;

  const capability = doc.canPatch(change.operations);
  if (!capability.ok) return capabilityError(id, capability);

  return { ok: true, change: copyChange(change) };
}

function canCloseChange(
  changes: ReadonlyMap<string, ProposedChange>,
  id: string,
  action: "reject",
): ProposedChangeResult {
  const change = changes.get(id);
  if (change === undefined) return notFound(id);
  if (change.status !== "open") return notOpen(id, change.status, action);
  return { ok: true, change: copyChange(change) };
}

function createChange(
  id: string,
  input: ProposedChangeInput,
  plan: ProposedChangePlan,
): ProposedChange {
  const change: ProposedChange = {
    id,
    status: "open",
    operations: copyOperations(plan.operations),
    guards: copyGuards(plan.guards),
  };
  if (input.label !== undefined) change.label = input.label;
  if (input.description !== undefined) change.description = input.description;
  if (input.data !== undefined) change.data = cloneJson(input.data);
  return change;
}

function guardsFor<TDocument>(
  doc: JSONDocument<TDocument>,
  operations: ReadonlyArray<JSONPatchOperation>,
): ReadonlyArray<ProposedChangeGuard> {
  const paths = new Set<Pointer>();
  for (const operation of operations) {
    for (const path of guardPaths(operation)) {
      paths.add(path);
    }
  }

  const guards: ProposedChangeGuard[] = [];
  for (const path of paths) {
    const read = doc.at(path);
    if (read.ok) {
      guards.push({ path, value: cloneJson(read.value) });
    }
  }
  return guards;
}

function guardPaths(operation: JSONPatchOperation): Pointer[] {
  if (operation.op === "add") return [guardAddPath(operation.path)];
  if (operation.op === "move") return [operation.from, guardAddPath(operation.path)];
  if (operation.op === "copy") return [operation.from, guardAddPath(operation.path)];
  return [operation.path];
}

function guardAddPath(path: Pointer): Pointer {
  return parentPointer(path) ?? "";
}

function staleGuard<TDocument>(
  doc: JSONDocument<TDocument>,
  change: ProposedChange,
): ProposedChangeError | null {
  for (const guard of change.guards) {
    const read = doc.at(guard.path);
    if (!read.ok) {
      return proposedChangeError("stale_change", `proposed change guard path no longer exists: ${guard.path}`, {
        id: change.id,
        pointer: guard.path,
      });
    }
    if (JSON.stringify(read.value) !== JSON.stringify(guard.value)) {
      return proposedChangeError("stale_change", `proposed change guard changed: ${guard.path}`, {
        id: change.id,
        pointer: guard.path,
      });
    }
  }
  return null;
}

function toPatchArray(input: JSONPatchInput): JSONPatchOperation[] {
  return Array.isArray(input)
    ? input.map((operation) => cloneJson(operation) as JSONPatchOperation)
    : [cloneJson(input) as JSONPatchOperation];
}

function nextChangeId(state: ProposedChangeState): string {
  const id = `change-${state.nextId}`;
  state.nextId += 1;
  return id;
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

function snapshot(
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

function snapshotSignature(changes: ReadonlyMap<string, ProposedChange>): string {
  return JSON.stringify([...changes.values()].map(copyChange));
}

function emit(
  listeners: ReadonlySet<ProposedChangeListener>,
  snapshotValue: ProposedChangeSnapshot,
): void {
  for (const listener of listeners) listener(snapshotValue);
}

function copyChange(change: ProposedChange): ProposedChange {
  const copy: ProposedChange = {
    id: change.id,
    status: change.status,
    operations: copyOperations(change.operations),
    guards: copyGuards(change.guards),
  };
  if (change.label !== undefined) copy.label = change.label;
  if (change.description !== undefined) copy.description = change.description;
  if (change.data !== undefined) copy.data = cloneJson(change.data);
  return copy;
}

function copyOperations(operations: ReadonlyArray<JSONPatchOperation>): JSONPatchOperation[] {
  return operations.map((operation) => cloneJson(operation) as JSONPatchOperation);
}

function copyGuards(guards: ReadonlyArray<ProposedChangeGuard>): ProposedChangeGuard[] {
  return guards.map((guard) => ({
    path: guard.path,
    value: cloneJson(guard.value),
  }));
}

function capabilityError(
  id: string | undefined,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): ProposedChangeError {
  return proposedChangeError("patch_rejected", capability.reason ?? "proposed change patch rejected", {
    ...(id === undefined ? {} : { id }),
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  });
}

function patchError(
  id: string,
  result: Exclude<JSONResult, { ok: true }>,
): ProposedChangeError {
  return proposedChangeError("patch_failed", result.reason ?? "proposed change patch failed", {
    id,
    ...(result.pointer === undefined ? {} : { pointer: result.pointer }),
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}

function notFound(id: string): ProposedChangeError {
  return proposedChangeError("not_found", `proposed change not found: ${id}`, { id });
}

function notOpen(id: string, status: ProposedChangeStatus, action = "accept"): ProposedChangeError {
  return proposedChangeError("not_open", `cannot ${action} ${status} change: ${id}`, { id });
}

function proposedChangeError(
  code: ProposedChangeErrorCode,
  reason: string,
  options: {
    id?: string;
    pointer?: Pointer;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<JSONResult, { ok: true }>;
  } = {},
): ProposedChangeError {
  const error: ProposedChangeError = { ok: false, code, reason };
  if (options.id !== undefined) error.id = options.id;
  if (options.pointer !== undefined) error.pointer = options.pointer;
  if (options.capability !== undefined) error.capability = options.capability;
  if (options.result !== undefined) error.result = options.result;
  return error;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
