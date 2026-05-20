// Headless draft/pending field state.
// React useDraft/useField are facades over this implementation.

import type { JSONResult } from "./core/patch/index.js";
import { cloneJson } from "./core/json.js";
import type { Pointer } from "./core/pointer/index.js";
import { readAt, tryParsePointer } from "./core/pointer/index.js";
import type { PointerOf, ValueAt } from "./core/pointer/types.js";
import { JSONCrudError } from "./JSONCrudError.js";
import type { JSONOps } from "./jsonOps.js";

export interface DraftDocument<T> {
  readonly value: T;
  readonly ops: Pick<JSONOps<T>, "set" | "load" | "subscribe">;
}

export interface DraftFieldState<T> {
  pointer: Pointer;
  value: unknown;
  committed: unknown;
  attempted: unknown;
  error: JSONResult | null;
  dirty: boolean;
  touched: boolean;
  pending: boolean;
  set(value: unknown): JSONResult;
  commit(): JSONResult;
  discardAttempt(): void;
  resetToBaseline(): JSONResult;
}

export type DraftChangeListener<T> = (draft: DraftState<T>) => void;

export interface DraftState<T> {
  dirty: boolean;
  touched: boolean;
  pending: boolean;
  canSave: boolean;
  pendingPaths: Pointer[];
  errors: ReadonlyMap<Pointer, JSONResult>;
  field<P extends PointerOf<T>>(pointer: P): DraftFieldState<ValueAt<T, P>>;
  markSaved(): void;
  discardAttempts(): void;
  resetToBaseline(): JSONResult;
  revalidate(): void;
  subscribe(listener: DraftChangeListener<T>): () => void;
}

export interface HeadlessDraftState<T> extends DraftState<T> {
  dispose(): void;
}

export interface CreateDraftOptions {
  onChange?: () => void;
}

interface Attempt {
  value: unknown;
  error: JSONResult;
}

const ok: JSONResult = { ok: true };

export function createDraft<T>(
  doc: DraftDocument<T>,
  options: CreateDraftOptions = {},
): HeadlessDraftState<T> {
  let baseline = deepClone(doc.value);
  let attempts = new Map<Pointer, Attempt>();
  let touched = new Set<Pointer>();
  let disposed = false;
  let revalidating = false;
  const listeners = new Set<DraftChangeListener<T>>();
  let api: HeadlessDraftState<T>;

  const emit = (): void => {
    if (disposed) return;
    options.onChange?.();
    for (const listener of listeners) listener(api);
  };

  const applyField = (pointer: Pointer, value: unknown): JSONResult => {
    try {
      return doc.ops.set(pointer as never, value as never);
    } catch (error) {
      if (error instanceof JSONCrudError) return error.result;
      throw error;
    }
  };

  const setField = (pointer: Pointer, value: unknown): JSONResult => {
    const result = applyField(pointer, value);
    if (result.ok) {
      attempts.delete(pointer);
    } else {
      attempts.set(pointer, { value: cloneAttemptValue(value), error: result });
    }
    touched.add(pointer);
    emit();
    return result;
  };

  const revalidate = (): void => {
    if (revalidating) return;
    revalidating = true;
    try {
      const nextAttempts = new Map<Pointer, Attempt>();
      for (const [pointer, attempt] of attempts) {
        const result = applyField(pointer, attempt.value);
        if (!result.ok) nextAttempts.set(pointer, { value: attempt.value, error: result });
      }
      attempts = nextAttempts;
    } finally {
      revalidating = false;
    }
    emit();
  };

  const makeField = <P extends PointerOf<T>>(pointer: P): DraftFieldState<ValueAt<T, P>> => {
    const p = pointer as Pointer;
    const committedRead = readPointer(doc.value, p);
    const baselineRead = readPointer(baseline, p);
    const pointerError = committedRead.ok ? (baselineRead.ok ? null : baselineRead.error) : committedRead.error;
    const committed = committedRead.ok ? committedRead.value : undefined;
    const baselineValue = baselineRead.ok ? baselineRead.value : undefined;
    const attempt = attempts.get(p);

    return {
      pointer: p,
      value: attempt ? attempt.value : committed,
      committed,
      attempted: attempt?.value,
      error: attempt?.error ?? pointerError,
      dirty: !jsonEqual(committed, baselineValue),
      touched: touched.has(p),
      pending: Boolean(attempt),
      set: (value) => setField(p, value),
      commit: () => {
        if (pointerError) return pointerError;
        if (!attempt) return ok;
        return setField(p, attempt.value);
      },
      discardAttempt: () => {
        attempts.delete(p);
        emit();
      },
      resetToBaseline: () => {
        attempts.delete(p);
        const result = applyField(p, deepClone(baselineValue));
        emit();
        return result;
      },
    };
  };

  const unsubscribeOps = doc.ops.subscribe(() => {
    if (attempts.size > 0 && !revalidating) revalidate();
    else emit();
  });

  api = {
    get dirty() { return !jsonEqual(doc.value, baseline); },
    get touched() { return touched.size > 0; },
    get pending() { return attempts.size > 0; },
    get canSave() { return api.dirty && !api.pending; },
    get pendingPaths() { return [...attempts.keys()]; },
    get errors() {
      const errors = new Map<Pointer, JSONResult>();
      for (const [pointer, attempt] of attempts) errors.set(pointer, attempt.error);
      return errors;
    },
    field: makeField,
    markSaved() {
      baseline = deepClone(doc.value);
      attempts = new Map(attempts);
      emit();
    },
    discardAttempts() {
      attempts = new Map();
      emit();
    },
    resetToBaseline() {
      attempts = new Map();
      const result = doc.ops.load(deepClone(baseline), { preserveHistory: true });
      emit();
      return result;
    },
    revalidate,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      unsubscribeOps();
    },
  };

  return api;
}

function readPointer(value: unknown, pointer: Pointer):
  | { ok: true; value: unknown }
  | { ok: false; error: JSONResult } {
  const segments = tryParsePointer(pointer);
  if (segments === null) {
    return {
      ok: false,
      error: {
        ok: false,
        code: "invalid_pointer",
        reason: "invalid JSON Pointer",
        pointer,
      },
    };
  }
  const r = readAt(value, segments);
  return { ok: true, value: r.ok ? r.value : undefined };
}

function deepClone<T>(value: T): T {
  return cloneJson(value);
}

function cloneAttemptValue(value: unknown): unknown {
  try {
    return cloneJson(value);
  } catch {
    return value;
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
