import {
  trackPointer,
  type JSONDocument,
  type Pointer,
} from "zod-crud";

export type AnnotationStatus = "open" | "resolved";

export type AnnotationErrorCode =
  | "duplicate_id"
  | "empty_text"
  | "invalid_pointer"
  | "not_found"
  | "path_not_found";

export interface AnnotationError {
  ok: false;
  code: AnnotationErrorCode;
  reason?: string;
  pointer?: Pointer;
  id?: string;
}

export interface Annotation {
  id: string;
  pointer: Pointer | null;
  text: string;
  status: AnnotationStatus;
  lost: boolean;
  data?: Readonly<Record<string, unknown>>;
}

export interface AnnotationInput {
  id?: string;
  pointer: Pointer;
  text: string;
  status?: AnnotationStatus;
  data?: Readonly<Record<string, unknown>>;
}

export interface AnnotationUpdate {
  pointer?: Pointer;
  text?: string;
  status?: AnnotationStatus;
  data?: Readonly<Record<string, unknown>> | null;
}

export interface AnnotationFilter {
  status?: AnnotationStatus | "all";
  lost?: boolean | "all";
}

export interface AnnotationPointerFilter {
  includeResolved?: boolean;
  includeDescendants?: boolean;
}

export interface AnnotationSnapshot {
  annotations: ReadonlyArray<Annotation>;
  open: number;
  resolved: number;
  lost: number;
}

export type AnnotationResult =
  | { ok: true; annotation: Annotation }
  | AnnotationError;

export type AnnotationListResult =
  | { ok: true; annotations: ReadonlyArray<Annotation> }
  | AnnotationError;

export type AnnotationListener = (snapshot: AnnotationSnapshot) => void;

export interface Annotations {
  current(filter?: AnnotationFilter): AnnotationSnapshot;
  byId(id: string): Annotation | null;
  forPointer(pointer: Pointer, filter?: AnnotationPointerFilter): AnnotationListResult;
  canAdd(input: AnnotationInput): { ok: true } | AnnotationError;
  add(input: AnnotationInput): AnnotationResult;
  update(id: string, patch: AnnotationUpdate): AnnotationResult;
  resolve(id: string): AnnotationResult;
  reopen(id: string): AnnotationResult;
  remove(id: string): boolean;
  clear(): void;
  subscribe(listener: AnnotationListener): () => void;
  dispose(): void;
}

interface AnnotationState {
  nextId: number;
  annotations: Map<string, Annotation>;
}

export function createAnnotations<T>(doc: JSONDocument<T>): Annotations {
  const state: AnnotationState = {
    nextId: 1,
    annotations: new Map(),
  };
  const listeners = new Set<AnnotationListener>();
  let disposed = false;

  const emitIfChanged = (before: string): void => {
    const after = snapshotSignature(state.annotations);
    if (before === after) return;
    emit(listeners, snapshot(state.annotations));
  };

  const unsubscribeDocument = doc.subscribe((applied) => {
    if (disposed || applied.length === 0 || state.annotations.size === 0) return;

    const before = snapshotSignature(state.annotations);
    for (const annotation of state.annotations.values()) {
      if (annotation.pointer === null) continue;

      const tracked = trackPointer(annotation.pointer, applied);
      if (tracked !== null && doc.exists(tracked)) {
        annotation.pointer = tracked;
        annotation.lost = false;
        continue;
      }

      annotation.pointer = null;
      annotation.lost = true;
    }
    emitIfChanged(before);
  });

  return {
    current(filter = {}) {
      return snapshot(state.annotations, filter);
    },
    byId(id) {
      const annotation = state.annotations.get(id);
      return annotation === undefined ? null : copyAnnotation(annotation);
    },
    forPointer(pointer, filter = {}) {
      const read = doc.at(pointer);
      if (!read.ok) return readError(read.code, read.pointer, read.reason);

      const annotations = list(state.annotations)
        .filter((annotation) => matchesPointer(annotation, pointer, filter))
        .map(copyAnnotation);
      return { ok: true, annotations };
    },
    canAdd(input) {
      return canAdd(doc, state.annotations, input);
    },
    add(input) {
      const capability = canAdd(doc, state.annotations, input);
      if (!capability.ok) return capability;

      const before = snapshotSignature(state.annotations);
      const id = input.id ?? nextAnnotationId(state);
      const annotation = createAnnotation(id, input);
      state.annotations.set(id, annotation);
      emitIfChanged(before);
      return { ok: true, annotation: copyAnnotation(annotation) };
    },
    update(id, patch) {
      const annotation = state.annotations.get(id);
      if (annotation === undefined) return notFound(id);

      if (hasOwn(patch, "text") && isEmptyText(patch.text)) {
        return { ok: false, code: "empty_text", id };
      }

      if (patch.pointer !== undefined) {
        const read = doc.at(patch.pointer);
        if (!read.ok) return readError(read.code, read.pointer, read.reason);
      }

      const before = snapshotSignature(state.annotations);
      if (patch.pointer !== undefined) {
        annotation.pointer = patch.pointer;
        annotation.lost = false;
      }
      if (patch.text !== undefined) annotation.text = patch.text;
      if (patch.status !== undefined) annotation.status = patch.status;
      if (hasOwn(patch, "data")) {
        if (patch.data === null) {
          delete annotation.data;
        } else if (patch.data !== undefined) {
          annotation.data = copyData(patch.data);
        }
      }
      emitIfChanged(before);
      return { ok: true, annotation: copyAnnotation(annotation) };
    },
    resolve(id) {
      return setStatus(state.annotations, listeners, id, "resolved");
    },
    reopen(id) {
      return setStatus(state.annotations, listeners, id, "open");
    },
    remove(id) {
      const before = snapshotSignature(state.annotations);
      const removed = state.annotations.delete(id);
      if (removed) emitIfChanged(before);
      return removed;
    },
    clear() {
      const before = snapshotSignature(state.annotations);
      state.annotations.clear();
      emitIfChanged(before);
    },
    subscribe(listener) {
      if (disposed) return () => {};

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;

      disposed = true;
      unsubscribeDocument();
      listeners.clear();
    },
  };
}

function canAdd<T>(
  doc: JSONDocument<T>,
  annotations: ReadonlyMap<string, Annotation>,
  input: AnnotationInput,
): { ok: true } | AnnotationError {
  if (input.id !== undefined && annotations.has(input.id)) {
    return { ok: false, code: "duplicate_id", id: input.id };
  }
  if (isEmptyText(input.text)) {
    return input.id === undefined
      ? { ok: false, code: "empty_text" }
      : { ok: false, code: "empty_text", id: input.id };
  }

  const read = doc.at(input.pointer);
  if (!read.ok) return readError(read.code, read.pointer, read.reason);
  return { ok: true };
}

function createAnnotation(id: string, input: AnnotationInput): Annotation {
  const annotation: Annotation = {
    id,
    pointer: input.pointer,
    text: input.text,
    status: input.status ?? "open",
    lost: false,
  };
  if (input.data !== undefined) annotation.data = copyData(input.data);
  return annotation;
}

function setStatus(
  annotations: Map<string, Annotation>,
  listeners: Set<AnnotationListener>,
  id: string,
  status: AnnotationStatus,
): AnnotationResult {
  const annotation = annotations.get(id);
  if (annotation === undefined) return notFound(id);

  const before = snapshotSignature(annotations);
  annotation.status = status;
  const after = snapshotSignature(annotations);
  if (before !== after) emit(listeners, snapshot(annotations));
  return { ok: true, annotation: copyAnnotation(annotation) };
}

function snapshot(
  annotations: ReadonlyMap<string, Annotation>,
  filter: AnnotationFilter = {},
): AnnotationSnapshot {
  const all = list(annotations).map(copyAnnotation);
  const visible = all.filter((annotation) => matchesFilter(annotation, filter));
  return {
    annotations: visible,
    open: all.filter((annotation) => annotation.status === "open").length,
    resolved: all.filter((annotation) => annotation.status === "resolved").length,
    lost: all.filter((annotation) => annotation.lost).length,
  };
}

function list(annotations: ReadonlyMap<string, Annotation>): Annotation[] {
  return [...annotations.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function matchesFilter(annotation: Annotation, filter: AnnotationFilter): boolean {
  if (filter.status !== undefined && filter.status !== "all" && annotation.status !== filter.status) {
    return false;
  }
  if (filter.lost !== undefined && filter.lost !== "all" && annotation.lost !== filter.lost) {
    return false;
  }
  return true;
}

function matchesPointer(
  annotation: Annotation,
  pointer: Pointer,
  filter: AnnotationPointerFilter,
): boolean {
  if (annotation.pointer === null) return false;
  if (annotation.status === "resolved" && filter.includeResolved !== true) return false;
  if (annotation.pointer === pointer) return true;
  if (filter.includeDescendants !== true) return false;
  return isPointerDescendant(annotation.pointer, pointer);
}

function isPointerDescendant(candidate: Pointer, scope: Pointer): boolean {
  if (scope === "") return candidate !== "";
  return candidate.startsWith(`${scope}/`);
}

function emit(
  listeners: Set<AnnotationListener>,
  value: AnnotationSnapshot,
): void {
  const event = copySnapshot(value);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot(value: AnnotationSnapshot): AnnotationSnapshot {
  return {
    annotations: value.annotations.map(copyAnnotation),
    open: value.open,
    resolved: value.resolved,
    lost: value.lost,
  };
}

function copyAnnotation(annotation: Annotation): Annotation {
  const copy: Annotation = {
    id: annotation.id,
    pointer: annotation.pointer,
    text: annotation.text,
    status: annotation.status,
    lost: annotation.lost,
  };
  if (annotation.data !== undefined) copy.data = copyData(annotation.data);
  return copy;
}

function copyData(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return { ...data };
}

function snapshotSignature(annotations: ReadonlyMap<string, Annotation>): string {
  return JSON.stringify(list(annotations));
}

function nextAnnotationId(state: AnnotationState): string {
  let id = "";
  do {
    id = `annotation-${state.nextId}`;
    state.nextId += 1;
  } while (state.annotations.has(id));
  return id;
}

function isEmptyText(text: string | undefined): boolean {
  return text === undefined || text.trim().length === 0;
}

function readError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): AnnotationError {
  return {
    ok: false,
    code,
    ...(reason !== undefined ? { reason } : {}),
    pointer,
  };
}

function notFound(id: string): AnnotationError {
  return { ok: false, code: "not_found", id };
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}
