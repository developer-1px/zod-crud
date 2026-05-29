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

export type SuggestionStatus = "open" | "accepted" | "rejected";

export type SuggestionErrorCode =
  | "duplicate_id"
  | "empty_patch"
  | "not_found"
  | "not_open"
  | "patch_rejected"
  | "patch_failed"
  | "stale_suggestion";

export interface SuggestionGuard {
  path: Pointer;
  value: unknown;
}

export interface Suggestion {
  id: string;
  status: SuggestionStatus;
  operations: ReadonlyArray<JSONPatchOperation>;
  guards: ReadonlyArray<SuggestionGuard>;
  label?: string;
  description?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface SuggestionInput {
  id?: string;
  operations: JSONPatchInput;
  label?: string;
  description?: string;
  data?: Readonly<Record<string, unknown>>;
}

export interface SuggestionFilter {
  status?: SuggestionStatus | "all";
}

export interface SuggestionSnapshot {
  suggestions: ReadonlyArray<Suggestion>;
  open: number;
  accepted: number;
  rejected: number;
}

export interface SuggestionError {
  ok: false;
  code: SuggestionErrorCode;
  reason: string;
  id?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult, { ok: true }>;
}

export interface SuggestionPlan {
  ok: true;
  operations: ReadonlyArray<JSONPatchOperation>;
  guards: ReadonlyArray<SuggestionGuard>;
}

export type SuggestionPlanResult = SuggestionPlan | SuggestionError;

export type SuggestionResult =
  | { ok: true; suggestion: Suggestion }
  | SuggestionError;

export type SuggestionAcceptResult =
  | { ok: true; suggestion: Suggestion; result: JSONResult }
  | SuggestionError;

export type SuggestionListener = (snapshot: SuggestionSnapshot) => void;

export interface Suggestions<TDocument> {
  current(filter?: SuggestionFilter): SuggestionSnapshot;
  byId(id: string): Suggestion | null;
  canPropose(input: SuggestionInput): SuggestionPlanResult;
  propose(input: SuggestionInput): SuggestionResult;
  canAccept(id: string): SuggestionResult;
  accept(id: string, metadata?: JSONChangeMetadata): SuggestionAcceptResult;
  canReject(id: string): SuggestionResult;
  reject(id: string): SuggestionResult;
  remove(id: string): boolean;
  clear(): void;
  subscribe(listener: SuggestionListener): () => void;
}

interface SuggestionState {
  nextId: number;
  suggestions: Map<string, Suggestion>;
}

export function createSuggestions<TDocument>(
  doc: JSONDocument<TDocument>,
): Suggestions<TDocument> {
  const state: SuggestionState = {
    nextId: 1,
    suggestions: new Map(),
  };
  const listeners = new Set<SuggestionListener>();

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(state.suggestions);
    if (before === after) return;
    emit(listeners, snapshot(state.suggestions));
  };

  return {
    current(filter = {}) {
      return snapshot(state.suggestions, filter);
    },
    byId(id) {
      const suggestion = state.suggestions.get(id);
      return suggestion === undefined ? null : copySuggestion(suggestion);
    },
    canPropose(input) {
      return canProposeSuggestion(doc, state.suggestions, input);
    },
    propose(input) {
      const plan = canProposeSuggestion(doc, state.suggestions, input);
      if (!plan.ok) return plan;

      const before = snapshotSignature(state.suggestions);
      const id = input.id ?? nextSuggestionId(state);
      const suggestion = createSuggestion(id, input, plan);
      state.suggestions.set(id, suggestion);
      emitIfChanged(before);
      return { ok: true, suggestion: copySuggestion(suggestion) };
    },
    canAccept(id) {
      return canAcceptSuggestion(doc, state.suggestions, id);
    },
    accept(id, metadata) {
      const capability = canAcceptSuggestion(doc, state.suggestions, id);
      if (!capability.ok) return capability;

      const result = doc.patch(capability.suggestion.operations, metadata);
      if (!result.ok) return patchError(id, result);

      const before = snapshotSignature(state.suggestions);
      const suggestion = state.suggestions.get(id)!;
      suggestion.status = "accepted";
      emitIfChanged(before);
      return { ok: true, suggestion: copySuggestion(suggestion), result };
    },
    canReject(id) {
      return canCloseSuggestion(state.suggestions, id, "reject");
    },
    reject(id) {
      const capability = canCloseSuggestion(state.suggestions, id, "reject");
      if (!capability.ok) return capability;

      const before = snapshotSignature(state.suggestions);
      const suggestion = state.suggestions.get(id)!;
      suggestion.status = "rejected";
      emitIfChanged(before);
      return { ok: true, suggestion: copySuggestion(suggestion) };
    },
    remove(id) {
      const before = snapshotSignature(state.suggestions);
      const removed = state.suggestions.delete(id);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(state.suggestions);
      state.suggestions.clear();
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

export function canProposeSuggestion<TDocument>(
  doc: JSONDocument<TDocument>,
  suggestions: ReadonlyMap<string, Suggestion>,
  input: SuggestionInput,
): SuggestionPlanResult {
  if (input.id !== undefined && suggestions.has(input.id)) {
    return suggestionError("duplicate_id", `suggestion already exists: ${input.id}`, { id: input.id });
  }

  const operations = toPatchArray(input.operations);
  if (operations.length === 0) {
    return suggestionError("empty_patch", "suggestion patch is empty", idOption(input.id));
  }

  const capability = doc.canPatch(operations);
  if (!capability.ok) return capabilityError(undefined, capability);

  return {
    ok: true,
    operations: copyOperations(operations),
    guards: guardsFor(doc, operations),
  };
}

export function canAcceptSuggestion<TDocument>(
  doc: JSONDocument<TDocument>,
  suggestions: ReadonlyMap<string, Suggestion>,
  id: string,
): SuggestionResult {
  const suggestion = suggestions.get(id);
  if (suggestion === undefined) return notFound(id);
  if (suggestion.status !== "open") return notOpen(id, suggestion.status);

  const stale = staleGuard(doc, suggestion);
  if (stale !== null) return stale;

  const capability = doc.canPatch(suggestion.operations);
  if (!capability.ok) return capabilityError(id, capability);

  return { ok: true, suggestion: copySuggestion(suggestion) };
}

function canCloseSuggestion(
  suggestions: ReadonlyMap<string, Suggestion>,
  id: string,
  action: "reject",
): SuggestionResult {
  const suggestion = suggestions.get(id);
  if (suggestion === undefined) return notFound(id);
  if (suggestion.status !== "open") return notOpen(id, suggestion.status, action);
  return { ok: true, suggestion: copySuggestion(suggestion) };
}

function createSuggestion(
  id: string,
  input: SuggestionInput,
  plan: SuggestionPlan,
): Suggestion {
  const suggestion: Suggestion = {
    id,
    status: "open",
    operations: copyOperations(plan.operations),
    guards: copyGuards(plan.guards),
  };
  if (input.label !== undefined) suggestion.label = input.label;
  if (input.description !== undefined) suggestion.description = input.description;
  if (input.data !== undefined) suggestion.data = copyData(input.data);
  return suggestion;
}

function guardsFor<TDocument>(
  doc: JSONDocument<TDocument>,
  operations: ReadonlyArray<JSONPatchOperation>,
): ReadonlyArray<SuggestionGuard> {
  const paths = new Set<Pointer>();
  for (const operation of operations) {
    for (const path of guardPaths(operation)) {
      paths.add(path);
    }
  }

  const guards: SuggestionGuard[] = [];
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
  suggestion: Suggestion,
): SuggestionError | null {
  for (const guard of suggestion.guards) {
    const read = doc.at(guard.path);
    if (!read.ok) {
      return suggestionError("stale_suggestion", `suggestion guard path no longer exists: ${guard.path}`, {
        id: suggestion.id,
        pointer: guard.path,
      });
    }
    if (!jsonEqual(read.value, guard.value)) {
      return suggestionError("stale_suggestion", `suggestion guard changed: ${guard.path}`, {
        id: suggestion.id,
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

function nextSuggestionId(state: SuggestionState): string {
  const id = `suggestion-${state.nextId}`;
  state.nextId += 1;
  return id;
}

function snapshot(
  suggestions: ReadonlyMap<string, Suggestion>,
  filter: SuggestionFilter = {},
): SuggestionSnapshot {
  const status = filter.status ?? "open";
  const list = [...suggestions.values()];
  const filtered = status === "all"
    ? list
    : list.filter((suggestion) => suggestion.status === status);

  return {
    suggestions: filtered.map(copySuggestion),
    open: list.filter((suggestion) => suggestion.status === "open").length,
    accepted: list.filter((suggestion) => suggestion.status === "accepted").length,
    rejected: list.filter((suggestion) => suggestion.status === "rejected").length,
  };
}

function snapshotSignature(suggestions: ReadonlyMap<string, Suggestion>): string {
  return JSON.stringify([...suggestions.values()].map(copySuggestion));
}

function emit(
  listeners: ReadonlySet<SuggestionListener>,
  snapshotValue: SuggestionSnapshot,
): void {
  for (const listener of listeners) listener(snapshotValue);
}

function copySuggestion(suggestion: Suggestion): Suggestion {
  const copy: Suggestion = {
    id: suggestion.id,
    status: suggestion.status,
    operations: copyOperations(suggestion.operations),
    guards: copyGuards(suggestion.guards),
  };
  if (suggestion.label !== undefined) copy.label = suggestion.label;
  if (suggestion.description !== undefined) copy.description = suggestion.description;
  if (suggestion.data !== undefined) copy.data = copyData(suggestion.data);
  return copy;
}

function copyOperations(operations: ReadonlyArray<JSONPatchOperation>): JSONPatchOperation[] {
  return operations.map((operation) => cloneJson(operation) as JSONPatchOperation);
}

function copyGuards(guards: ReadonlyArray<SuggestionGuard>): SuggestionGuard[] {
  return guards.map((guard) => ({
    path: guard.path,
    value: cloneJson(guard.value),
  }));
}

function copyData(data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return cloneJson(data);
}

function capabilityError(
  id: string | undefined,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): SuggestionError {
  return suggestionError("patch_rejected", capability.reason ?? "suggestion patch rejected", {
    ...idOption(id),
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
    capability: cloneJson(capability) as Exclude<JSONCapabilityResult, { ok: true }>,
  });
}

function patchError(
  id: string,
  result: Exclude<JSONResult, { ok: true }>,
): SuggestionError {
  return suggestionError("patch_failed", result.reason ?? "suggestion patch failed", {
    id,
    ...(result.pointer === undefined ? {} : { pointer: result.pointer }),
    result: cloneJson(result) as Exclude<JSONResult, { ok: true }>,
  });
}

function notFound(id: string): SuggestionError {
  return suggestionError("not_found", `suggestion not found: ${id}`, { id });
}

function notOpen(id: string, status: SuggestionStatus, action = "accept"): SuggestionError {
  return suggestionError("not_open", `cannot ${action} ${status} suggestion: ${id}`, { id });
}

function suggestionError(
  code: SuggestionErrorCode,
  reason: string,
  options: {
    id?: string;
    pointer?: Pointer;
    capability?: Exclude<JSONCapabilityResult, { ok: true }>;
    result?: Exclude<JSONResult, { ok: true }>;
  } = {},
): SuggestionError {
  const error: SuggestionError = { ok: false, code, reason };
  if (options.id !== undefined) error.id = options.id;
  if (options.pointer !== undefined) error.pointer = options.pointer;
  if (options.capability !== undefined) error.capability = options.capability;
  if (options.result !== undefined) error.result = options.result;
  return error;
}

function idOption(id: string | undefined): { id?: string } {
  return id === undefined ? {} : { id };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}
