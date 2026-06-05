import {
  copyEntry,
} from "./copy.js";
import type {
  PatchLogEntry,
} from "./types.js";

export interface PatchLogStore {
  push(entry: PatchLogEntry): void;
  entries(): ReadonlyArray<PatchLogEntry>;
  clear(): void;
}

export function createPatchLogStore(): PatchLogStore {
  const log: PatchLogEntry[] = [];
  return {
    push(entry) {
      log.push(copyEntry(entry));
    },
    entries: () => log.map(copyEntry),
    clear: () => { log.length = 0; },
  };
}
