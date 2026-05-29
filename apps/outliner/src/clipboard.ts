// Outliner clipboard adapter. @zod-crud/clipboard-web owns the bridge between
// core JSON clipboard payloads and a text clipboard host; this app keeps only
// sibling/child paste UX and compact status state.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  createWebClipboard,
  type TextClipboardHost,
  type WebClipboardCopyResult,
  type WebClipboardCutResult,
  type WebClipboardPasteResult,
} from "@zod-crud/clipboard-web";
import type { JSONDocument, Pointer } from "zod-crud";
import type { OutlineNode } from "./schema.js";

export type ClipboardMode = "empty" | "copy" | "cut";

export interface ClipboardSnapshot {
  mode: ClipboardMode;
  count: number;
  sources: ReadonlyArray<Pointer>;
}

export type PasteMode = "sibling" | "child";
export type ClipboardCopyCommandResult = WebClipboardCopyResult;
export type ClipboardCutCommandResult = WebClipboardCutResult<OutlineNode>;
export type ClipboardPasteCommandResult = WebClipboardPasteResult<OutlineNode>;

export interface ClipboardApi {
  mode: ClipboardMode;
  count: number;
  sources: ReadonlyArray<Pointer>;
  copy(sources: ReadonlyArray<Pointer>): Promise<ClipboardCopyCommandResult>;
  cut(sources: ReadonlyArray<Pointer>): Promise<ClipboardCutCommandResult>;
  paste(target: Pointer, mode: PasteMode): Promise<ClipboardPasteCommandResult> | ClipboardPasteCommandResult;
  clear(): void;
}

const EMPTY: ClipboardSnapshot = { mode: "empty", count: 0, sources: [] };

function pasteTarget(target: Pointer, mode: PasteMode): Pointer | { after: Pointer } {
  if (mode === "child" || target === "") return `${target}/children/-`;
  return { after: target };
}

function createMemoryTextClipboardHost(): TextClipboardHost {
  let text = "";
  return {
    readText: () => text,
    writeText: (next) => {
      text = next;
    },
  };
}

function resolveTextClipboardHost(fallback: TextClipboardHost): {
  host: TextClipboardHost;
  usesSystemClipboard: boolean;
} {
  const system = globalThis.navigator?.clipboard;
  if (
    globalThis.isSecureContext === true &&
    typeof system?.readText === "function" &&
    typeof system.writeText === "function"
  ) {
    return { host: system, usesSystemClipboard: true };
  }
  return { host: fallback, usesSystemClipboard: false };
}

function payloadCount(payload: unknown): number {
  return Array.isArray(payload) ? payload.length : 1;
}

function emptyClipboardResult(): ClipboardPasteCommandResult {
  return { ok: false, code: "path_not_found", reason: "clipboard is empty" };
}

export function useClipboard(document: JSONDocument<OutlineNode>): ClipboardApi {
  const [snap, setSnap] = useState<ClipboardSnapshot>(EMPTY);
  const snapRef = useRef<ClipboardSnapshot>(EMPTY);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const fallbackHostRef = useRef<TextClipboardHost | null>(null);
  fallbackHostRef.current ??= createMemoryTextClipboardHost();

  const resolvedHost = useMemo(
    () => resolveTextClipboardHost(fallbackHostRef.current!),
    [],
  );
  const webClipboard = useMemo(
    () => createWebClipboard(document, { host: resolvedHost.host }),
    [document, resolvedHost.host],
  );

  const updateSnap = useCallback((next: ClipboardSnapshot) => {
    snapRef.current = next;
    setSnap(next);
  }, []);

  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = pendingRef.current.then(work, work);
    pendingRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const copy = useCallback(async (sources: ReadonlyArray<Pointer>) => {
    return enqueue(async () => {
      const result = await webClipboard.copy(sources);
      if (result.ok) {
        updateSnap({ mode: "copy", count: payloadCount(result.payload), sources: result.sources });
      }
      return result;
    });
  }, [enqueue, updateSnap, webClipboard]);

  const cut = useCallback(async (sources: ReadonlyArray<Pointer>) => {
    return enqueue(async () => {
      const result = await webClipboard.cut(sources);
      if (result.ok) {
        updateSnap({ mode: "cut", count: payloadCount(result.payload), sources: result.sources });
      }
      return result;
    });
  }, [enqueue, updateSnap, webClipboard]);

  const paste = useCallback(
    (target: Pointer, mode: PasteMode): Promise<ClipboardPasteCommandResult> | ClipboardPasteCommandResult => {
      const cur = snapRef.current;
      if (!resolvedHost.usesSystemClipboard && cur.mode === "empty") {
        return emptyClipboardResult();
      }

      return enqueue(async () => {
        const result = await webClipboard.paste(pasteTarget(target, mode), {
          spread: true,
        });
        if (
          !result.ok
          && result.code === "clipboard_parse_failed"
          && !resolvedHost.usesSystemClipboard
          && cur.mode === "empty"
        ) {
          return emptyClipboardResult();
        }
        if (!result.ok && result.code === "clipboard_parse_failed" && cur.mode === "cut") {
          updateSnap(EMPTY);
        }
        if (result.ok && cur.mode === "cut") updateSnap(EMPTY);
        return result;
      });
    },
    [enqueue, resolvedHost.usesSystemClipboard, updateSnap, webClipboard],
  );

  const clear = useCallback(() => {
    document.clipboard.clear();
    updateSnap(EMPTY);
  }, [document.clipboard, updateSnap]);

  return {
    mode: snap.mode,
    count: snap.count,
    sources: snap.sources,
    copy,
    cut,
    paste,
    clear,
  };
}
