import type {
  JSONDocument,
} from "@interactive-os/json-document";

import {
  findDuplicateIds,
} from "./diagnostics.js";
import type {
  IdResolverDiagnostic,
  IdResolverEntry,
  IdResolverScope,
  IdResolverSnapshot,
} from "./types.js";

export function readCurrentSnapshot<T>(
  doc: JSONDocument<T>,
  scopes: ReadonlyArray<IdResolverScope>,
): IdResolverSnapshot {
  const entries: IdResolverEntry[] = [];
  const diagnostics: IdResolverDiagnostic[] = [];

  for (const scope of scopes) {
    const query = doc.query(scope.query);
    if (!query.ok) {
      diagnostics.push({
        code: "invalid_query",
        reason: query.reason ?? `invalid query for scope ${scope.scope}`,
        scope: scope.scope,
      });
      continue;
    }

    for (const pointer of query.pointers) {
      const read = doc.at(pointer);
      if (!read.ok) {
        diagnostics.push({
          code: "read_failed",
          reason: read.reason ?? `could not read id target: ${pointer}`,
          scope: scope.scope,
          pointer,
        });
        continue;
      }

      let id: string | null | undefined;
      try {
        id = scope.readId(read.value, pointer);
      } catch (error) {
        diagnostics.push({
          code: "invalid_id",
          reason: error instanceof Error ? error.message : `readId failed for ${pointer}`,
          scope: scope.scope,
          pointer,
        });
        continue;
      }

      if (id == null) continue;
      if (typeof id !== "string" || id.length === 0) {
        diagnostics.push({
          code: "invalid_id",
          reason: `id must be a non-empty string at ${pointer}`,
          scope: scope.scope,
          pointer,
        });
        continue;
      }

      entries.push({
        scope: scope.scope,
        id,
        pointer,
      });
    }
  }

  diagnostics.push(...findDuplicateIds(entries));

  return {
    entries,
    diagnostics,
  };
}
