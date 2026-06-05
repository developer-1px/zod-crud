import type { Pointer } from "../../../foundation/pointer/index.js";

export type ReadResult =
  | { ok: true; path: Pointer; value: unknown }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };

export type QueryResult =
  | { ok: true; query: string; pointers: Pointer[] }
  | { ok: false; code: "invalid_query"; reason?: string };

export type EntryKind = "root" | "object" | "array" | "record" | "primitive";

export interface ReadEntry {
  key: string;
  path: Pointer;
  value: unknown;
}

export type EntriesResult =
  | {
      ok: true;
      path: Pointer;
      kind: EntryKind;
      entries: ReadonlyArray<ReadEntry>;
    }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };
