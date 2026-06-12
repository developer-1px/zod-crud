import type {
  Pointer,
} from "@interactive-os/json-document";

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
