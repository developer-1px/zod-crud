// React draft facade over headless createDraft.

import { useEffect, useMemo, useReducer, useRef } from "react";

import {
  createDraft,
  type DraftChangeListener,
  type DraftFieldState,
  type DraftState,
  type HeadlessDraftState,
  type CreateDraftOptions,
} from "../draft.js";
import type { PointerOf, ValueAt } from "../core/pointer/types.js";
import type { JSONDocument } from "./useJSONDocument.js";

export type {
  CreateDraftOptions,
  DraftChangeListener,
  DraftFieldState,
  DraftState,
  HeadlessDraftState,
};

export function useDraft<T>(doc: JSONDocument<T>): DraftState<T> {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const docRef = useRef(doc);
  docRef.current = doc;
  const draft = useMemo(
    () => createDraft<T>({
      get value() { return docRef.current.value; },
      get ops() { return docRef.current.ops; },
    }, { onChange: force }),
    [doc.ops],
  );

  useEffect(() => () => draft.dispose(), [draft]);

  return draft;
}

export function useField<T, P extends PointerOf<T>>(
  doc: JSONDocument<T>,
  pointer: P,
): DraftFieldState<ValueAt<T, P>> {
  return useDraft(doc).field(pointer);
}
