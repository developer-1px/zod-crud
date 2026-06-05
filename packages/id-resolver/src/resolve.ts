import type {
  IdResolverScope,
  IdResolverSnapshot,
  ResolveIdErrorCode,
  ResolveIdResult,
} from "./types.js";

export function resolveId(
  scopes: ReadonlyArray<IdResolverScope>,
  snapshot: IdResolverSnapshot,
  scope: string,
  id: string,
): ResolveIdResult {
  if (!scopes.some((candidate) => candidate.scope === scope)) {
    return resolveError("scope_not_found", `scope is not registered: ${scope}`, scope, id);
  }

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
