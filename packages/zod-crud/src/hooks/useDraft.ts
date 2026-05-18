import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { JSONResult } from "../core/patch/index.js";
import type { Pointer } from "../core/pointer/index.js";
import { parsePointer, readAt } from "../core/pointer/index.js";
import type { PointerOf, ValueAt } from "../core/pointer/types.js";
import { JSONCrudError } from "../JSONCrudError.js";
import type { JSONDocument } from "./useJSONDocument.js";

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
}

interface Attempt {
  value: unknown;
  error: JSONResult;
}

interface DraftStore {
  attempts: Map<Pointer, Attempt>;
  touched: Set<Pointer>;
}

type DraftAction =
  | { type: "attempt"; pointer: Pointer; value: unknown; error: JSONResult }
  | { type: "accepted"; pointer: Pointer }
  | { type: "discard"; pointer: Pointer }
  | { type: "discardAll" }
  | { type: "replaceAttempts"; attempts: Map<Pointer, Attempt> };

const ok: JSONResult = { ok: true };

export function useDraft<T>(doc: JSONDocument<T>): DraftState<T> {
  const baselineRef = useRef(deepClone(doc.value));
  const [store, dispatch] = useReducer(reduceDraftStore, undefined, emptyDraftStore);
  const storeRef = useRef(store);
  storeRef.current = store;

  const applyField = useCallback((pointer: Pointer, value: unknown): JSONResult => {
    try {
      return doc.ops.set(pointer as never, value as never);
    } catch (error) {
      if (error instanceof JSONCrudError) return error.result;
      throw error;
    }
  }, [doc.ops]);

  const setField = useCallback((pointer: Pointer, value: unknown): JSONResult => {
    const result = applyField(pointer, value);
    if (result.ok) {
      dispatch({ type: "accepted", pointer });
      return result;
    }
    dispatch({ type: "attempt", pointer, value, error: result });
    return result;
  }, [applyField]);

  const revalidate = useCallback((): void => {
    const nextAttempts = new Map<Pointer, Attempt>();
    for (const [pointer, attempt] of storeRef.current.attempts) {
      const result = applyField(pointer, attempt.value);
      if (!result.ok) nextAttempts.set(pointer, { value: attempt.value, error: result });
    }
    dispatch({ type: "replaceAttempts", attempts: nextAttempts });
  }, [applyField]);

  useEffect(() => {
    if (storeRef.current.attempts.size === 0) return;
    revalidate();
  }, [doc.value, revalidate]);

  const markSaved = useCallback((): void => {
    baselineRef.current = deepClone(doc.value);
    dispatch({ type: "replaceAttempts", attempts: new Map(storeRef.current.attempts) });
  }, [doc.value]);

  const discardAttempts = useCallback((): void => {
    dispatch({ type: "discardAll" });
  }, []);

  const resetToBaseline = useCallback((): JSONResult => {
    dispatch({ type: "discardAll" });
    return doc.ops.load(deepClone(baselineRef.current), { preserveHistory: true });
  }, [doc.ops]);

  const makeField = useCallback(<P extends PointerOf<T>>(pointer: P): DraftFieldState<ValueAt<T, P>> => {
    const p = pointer as Pointer;
    const committed = readPointer(doc.value, p);
    const baseline = readPointer(baselineRef.current, p);
    const attempt = store.attempts.get(p);
    const touched = store.touched.has(p);

    return {
      pointer: p,
      value: attempt ? attempt.value : committed,
      committed,
      attempted: attempt?.value,
      error: attempt?.error ?? null,
      dirty: !jsonEqual(committed, baseline),
      touched,
      pending: Boolean(attempt),
      set: (value) => setField(p, value),
      commit: () => {
        if (!attempt) return ok;
        return setField(p, attempt.value);
      },
      discardAttempt: () => dispatch({ type: "discard", pointer: p }),
      resetToBaseline: () => {
        dispatch({ type: "discard", pointer: p });
        return applyField(p, deepClone(baseline));
      },
    };
  }, [applyField, doc.value, setField, store]);

  return useMemo<DraftState<T>>(() => {
    const errors = new Map<Pointer, JSONResult>();
    for (const [pointer, attempt] of store.attempts) errors.set(pointer, attempt.error);
    const dirty = !jsonEqual(doc.value, baselineRef.current);
    const pending = store.attempts.size > 0;

    return {
      dirty,
      touched: store.touched.size > 0,
      pending,
      canSave: dirty && !pending,
      pendingPaths: [...store.attempts.keys()],
      errors,
      field: makeField,
      markSaved,
      discardAttempts,
      resetToBaseline,
      revalidate,
    };
  }, [discardAttempts, doc.value, makeField, markSaved, resetToBaseline, revalidate, store]);
}

export function useField<T, P extends PointerOf<T>>(
  doc: JSONDocument<T>,
  pointer: P,
): DraftFieldState<ValueAt<T, P>> {
  return useDraft(doc).field(pointer);
}

function reduceDraftStore(store: DraftStore, action: DraftAction): DraftStore {
  switch (action.type) {
    case "attempt": {
      const attempts = new Map(store.attempts);
      attempts.set(action.pointer, { value: action.value, error: action.error });
      const touched = new Set(store.touched);
      touched.add(action.pointer);
      return { attempts, touched };
    }
    case "accepted": {
      const attempts = new Map(store.attempts);
      attempts.delete(action.pointer);
      const touched = new Set(store.touched);
      touched.add(action.pointer);
      return { attempts, touched };
    }
    case "discard": {
      const attempts = new Map(store.attempts);
      attempts.delete(action.pointer);
      return { ...store, attempts };
    }
    case "discardAll":
      return { ...store, attempts: new Map() };
    case "replaceAttempts":
      return { ...store, attempts: action.attempts };
  }
}

function emptyDraftStore(): DraftStore {
  return { attempts: new Map(), touched: new Set() };
}

function readPointer(value: unknown, pointer: Pointer): unknown {
  const r = readAt(value, parsePointer(pointer));
  return r.ok ? r.value : undefined;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
