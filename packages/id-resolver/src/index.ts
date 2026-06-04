import type {
  JSONDocument,
  Pointer,
} from "zod-crud";

export type IdResolverDiagnosticCode =
  | "invalid_query"
  | "read_failed"
  | "invalid_id"
  | "duplicate_id";

export type ResolveIdErrorCode =
  | "scope_not_found"
  | "id_not_found"
  | "ambiguous_id"
  | "invalid_query";

export interface IdResolverScope {
  scope: string;
  query: string;
  readId(value: unknown, pointer: Pointer): string | null | undefined;
}

export interface IdResolverEntry {
  scope: string;
  id: string;
  pointer: Pointer;
}

export interface IdResolverDiagnostic {
  code: IdResolverDiagnosticCode;
  reason: string;
  scope: string;
  id?: string;
  pointer?: Pointer;
  pointers?: ReadonlyArray<Pointer>;
}

export interface IdResolverSnapshot {
  entries: ReadonlyArray<IdResolverEntry>;
  diagnostics: ReadonlyArray<IdResolverDiagnostic>;
}

export type ResolveIdResult =
  | {
    ok: true;
    scope: string;
    id: string;
    pointer: Pointer;
  }
  | {
    ok: false;
    code: ResolveIdErrorCode;
    reason: string;
    scope: string;
    id?: string;
    pointers?: ReadonlyArray<Pointer>;
  };

export interface IdResolver {
  current(): IdResolverSnapshot;
  resolve(scope: string, id: string): ResolveIdResult;
}

export interface IdResolverOptions {
  scopes: ReadonlyArray<IdResolverScope>;
}

export function createIdResolver<T>(
  doc: JSONDocument<T>,
  options: IdResolverOptions,
): IdResolver {
  return {
    current: () => readCurrentSnapshot(doc, options.scopes),
    resolve(scope, id) {
      if (!options.scopes.some((candidate) => candidate.scope === scope)) {
        return resolveError("scope_not_found", `scope is not registered: ${scope}`, scope, id);
      }

      const snapshot = readCurrentSnapshot(doc, options.scopes);
      const invalidQuery = snapshot.diagnostics.find((diagnostic) => {
        return diagnostic.scope === scope && diagnostic.code === "invalid_query";
      });
      if (invalidQuery) {
        return resolveError("invalid_query", invalidQuery.reason, scope, id);
      }

      const matches = snapshot.entries.filter((entry) => {
        return entry.scope === scope && entry.id === id;
      });
      if (matches.length === 0) {
        return resolveError("id_not_found", `id not found in scope ${scope}: ${id}`, scope, id);
      }
      if (matches.length > 1) {
        return {
          ok: false,
          code: "ambiguous_id",
          reason: `id is duplicated in scope ${scope}: ${id}`,
          scope,
          id,
          pointers: matches.map((entry) => entry.pointer),
        };
      }

      const match = matches[0]!;
      return {
        ok: true,
        scope: match.scope,
        id: match.id,
        pointer: match.pointer,
      };
    },
  };
}

function readCurrentSnapshot<T>(
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

function findDuplicateIds(entries: ReadonlyArray<IdResolverEntry>): IdResolverDiagnostic[] {
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

function resolveError(
  code: ResolveIdErrorCode,
  reason: string,
  scope: string,
  id: string,
): ResolveIdResult {
  return {
    ok: false,
    code,
    reason,
    scope,
    id,
  };
}
