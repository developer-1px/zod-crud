import type { Pointer, SelectionRange } from "@interactive-os/json-document";

export type PresenceCursorErrorCode =
  | "empty_peer_id"
  | "empty_selection"
  | "invalid_pointer"
  | "not_found"
  | "path_not_found";

export interface PresenceCursorError {
  ok: false;
  code: PresenceCursorErrorCode;
  reason?: string;
  peerId?: string;
  pointer?: Pointer;
}

export interface PresenceCursor {
  peerId: string;
  label?: string;
  color?: string;
  selection: ReadonlyArray<SelectionRange>;
  primaryPointer: Pointer | null;
  lost: boolean;
  data?: Readonly<Record<string, unknown>>;
}

export interface PresenceCursorInput {
  peerId: string;
  label?: string;
  color?: string;
  selection: ReadonlyArray<SelectionRange>;
  data?: Readonly<Record<string, unknown>>;
}

export interface PresenceCursorUpdate {
  label?: string | null;
  color?: string | null;
  selection?: ReadonlyArray<SelectionRange>;
  data?: Readonly<Record<string, unknown>> | null;
}

export interface PresenceCursorSnapshot {
  cursors: ReadonlyArray<PresenceCursor>;
  active: number;
  lost: number;
}

export type PresenceCursorResult =
  | { ok: true; cursor: PresenceCursor }
  | PresenceCursorError;

export type PresenceCursorListener = (snapshot: PresenceCursorSnapshot) => void;

export interface LiveCursors {
  current(): PresenceCursorSnapshot;
  byPeer(peerId: string): PresenceCursor | null;
  canUpsert(input: PresenceCursorInput): { ok: true } | PresenceCursorError;
  upsert(input: PresenceCursorInput): PresenceCursorResult;
  update(peerId: string, patch: PresenceCursorUpdate): PresenceCursorResult;
  remove(peerId: string): boolean;
  clear(): void;
  subscribe(listener: PresenceCursorListener): () => void;
  dispose(): void;
}
