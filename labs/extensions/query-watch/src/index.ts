import type { JSONDocument, Pointer } from "zod-crud";

export type QueryWatchErrorCode =
  | "syntax_error"
  | "invalid_query"
  | "read_failed";

export interface QueryWatchMatch<TValue = unknown> {
  path: Pointer;
  value: TValue;
}

export type QueryWatchSnapshot<TValue = unknown> =
  | {
      ok: true;
      jsonPath: string;
      pointers: ReadonlyArray<Pointer>;
      values: ReadonlyArray<TValue>;
      matches: ReadonlyArray<QueryWatchMatch<TValue>>;
    }
  | {
      ok: false;
      jsonPath: string;
      code: QueryWatchErrorCode;
      reason?: string;
      pointer?: Pointer;
      pointers: ReadonlyArray<Pointer>;
    };

export type QueryWatchListener<TValue = unknown> = (
  snapshot: QueryWatchSnapshot<TValue>,
) => void;

export interface QueryWatch<TValue = unknown> {
  current(): QueryWatchSnapshot<TValue>;
  subscribe(listener: QueryWatchListener<TValue>): () => void;
  refresh(): QueryWatchSnapshot<TValue>;
  dispose(): void;
}

export function createQueryWatch<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): QueryWatch<TValue> {
  const listeners = new Set<QueryWatchListener<TValue>>();
  let disposed = false;
  let snapshot = readSnapshot<TDocument, TValue>(doc, jsonPath);

  const current = (): QueryWatchSnapshot<TValue> => copySnapshot(snapshot);

  const refresh = (): QueryWatchSnapshot<TValue> => {
    if (disposed) return current();

    const next = readSnapshot<TDocument, TValue>(doc, jsonPath);
    if (sameSnapshot(snapshot, next)) return current();

    snapshot = next;
    emit(listeners, snapshot);
    return current();
  };

  const unsubscribeDocument = doc.subscribe(() => {
    refresh();
  });

  return {
    current,
    subscribe(listener) {
      if (disposed) return () => {};

      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    dispose() {
      if (disposed) return;

      disposed = true;
      unsubscribeDocument();
      listeners.clear();
    },
  };
}

function readSnapshot<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): QueryWatchSnapshot<TValue> {
  const capability = doc.canFind(jsonPath);
  if (!capability.ok) {
    return {
      ok: false,
      jsonPath,
      code: "syntax_error",
      ...(capability.reason !== undefined ? { reason: capability.reason } : {}),
      pointers: [],
    };
  }

  const queried = doc.query(jsonPath);
  if (!queried.ok) {
    return {
      ok: false,
      jsonPath,
      code: "invalid_query",
      ...(queried.reason !== undefined ? { reason: queried.reason } : {}),
      pointers: [],
    };
  }

  const matches: QueryWatchMatch<TValue>[] = [];
  for (const pointer of queried.pointers) {
    const read = doc.at(pointer);
    if (!read.ok) {
      return {
        ok: false,
        jsonPath,
        code: "read_failed",
        ...(read.reason !== undefined ? { reason: read.reason } : {}),
        pointer,
        pointers: [...queried.pointers],
      };
    }

    matches.push({
      path: read.path,
      value: snapshotValue(read.value) as TValue,
    });
  }

  return {
    ok: true,
    jsonPath,
    pointers: matches.map((match) => match.path),
    values: matches.map((match) => match.value),
    matches,
  };
}

function emit<TValue>(
  listeners: Set<QueryWatchListener<TValue>>,
  snapshot: QueryWatchSnapshot<TValue>,
): void {
  const event = copySnapshot(snapshot);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot<TValue>(
  snapshot: QueryWatchSnapshot<TValue>,
): QueryWatchSnapshot<TValue> {
  if (!snapshot.ok) {
    return { ...snapshot, pointers: [...snapshot.pointers] };
  }

  const matches = snapshot.matches.map((match) => ({
    path: match.path,
    value: match.value,
  }));
  return {
    ...snapshot,
    pointers: [...snapshot.pointers],
    values: [...snapshot.values],
    matches,
  };
}

function sameSnapshot<TValue>(
  left: QueryWatchSnapshot<TValue>,
  right: QueryWatchSnapshot<TValue>,
): boolean {
  const leftSignature = signature(left);
  return leftSignature !== undefined && leftSignature === signature(right);
}

function signature<TValue>(snapshot: QueryWatchSnapshot<TValue>): string | undefined {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return undefined;
  }
}

function snapshotValue(value: unknown): unknown {
  if (value === undefined) return undefined;

  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}
