import type {
  Pointer,
} from "@interactive-os/json-document";

import type {
  IdResolverDiagnostic,
  IdResolverEntry,
} from "./types.js";

export function findDuplicateIds(entries: ReadonlyArray<IdResolverEntry>): IdResolverDiagnostic[] {
  const pointersByKey = new Map<string, Pointer[]>();

  for (const entry of entries) {
    const key = `${entry.scope}\0${entry.id}`;
    const pointers = pointersByKey.get(key);
    if (pointers) {
      pointers.push(entry.pointer);
    } else {
      pointersByKey.set(key, [entry.pointer]);
    }
  }

  const diagnostics: IdResolverDiagnostic[] = [];
  for (const [key, pointers] of pointersByKey) {
    if (pointers.length < 2) continue;
    const separator = key.indexOf("\0");
    const scope = key.slice(0, separator);
    const id = key.slice(separator + 1);
    diagnostics.push({
      code: "duplicate_id",
      reason: `id is duplicated in scope ${scope}: ${id}`,
      scope: scope ?? "",
      id,
      pointers,
    });
  }
  return diagnostics;
}
