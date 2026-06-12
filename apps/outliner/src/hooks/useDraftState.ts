import { useCallback, useEffect, useMemo, useState } from "react";
import { createDirtyState } from "@interactive-os/json-document-dirty-state";
import {
  createDocumentPersistence,
  type DocumentPersistenceRestoreResult,
  type DocumentPersistenceSaveResult,
} from "@interactive-os/json-document-persist-web";
import type { JSONDocument } from "@interactive-os/json-document";
import type { OutlineNode } from "../schema.js";

const DRAFT_KEY = "json-document.outliner.draft";

export type DraftCommandResult =
  | DocumentPersistenceSaveResult
  | DocumentPersistenceRestoreResult<OutlineNode>;

export interface DraftState {
  dirty: boolean;
  save(): Promise<DraftCommandResult>;
  restore(): Promise<DraftCommandResult>;
}

export function useDraftState(document: JSONDocument<OutlineNode>): DraftState {
  const dirtyState = useMemo(() => createDirtyState(document), [document]);
  const persistence = useMemo(
    () => createDocumentPersistence(document, { key: DRAFT_KEY }),
    [document],
  );
  const [dirty, setDirty] = useState(() => dirtyState.isDirty());

  useEffect(() => {
    setDirty(dirtyState.isDirty());
    const unsubscribe = dirtyState.subscribe((snapshot) => {
      setDirty(snapshot.dirty);
    });
    return () => {
      unsubscribe();
      dirtyState.dispose();
    };
  }, [dirtyState]);

  const markClean = useCallback(() => {
    setDirty(dirtyState.markClean().dirty);
  }, [dirtyState]);

  const save = useCallback(async () => {
    const result = await persistence.save();
    if (result.ok) markClean();
    return result;
  }, [markClean, persistence]);

  const restore = useCallback(async () => {
    const result = await persistence.restore({
      restoreSelection: true,
    });
    if (result.ok) markClean();
    return result;
  }, [markClean, persistence]);

  return {
    dirty,
    save,
    restore,
  };
}
