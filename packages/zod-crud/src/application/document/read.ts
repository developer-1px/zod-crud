import type * as z from "zod";

import { query as jsonpathQuery, JSONPathSyntaxError } from "../../foundation/jsonpath/index.js";
import { appendSegment, parsePointer, readAt, type Pointer } from "../../foundation/json-pointer/index.js";
import { schemaAtPointer } from "../../domain/schema/introspection.js";
import { getDef } from "../../domain/schema/zodIntrospectionAdapter.js";

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

interface PlanDocumentEntriesInput {
  schema: z.ZodType;
  path: Pointer;
  value: unknown;
}

interface DocumentEntriesPlan {
  kind: EntryKind;
  entries: ReadonlyArray<ReadEntry>;
}

export type EntriesResult =
  | {
      ok: true;
      path: Pointer;
      kind: EntryKind;
      entries: ReadonlyArray<ReadEntry>;
    }
  | { ok: false; code: "invalid_pointer" | "path_not_found"; reason?: string; pointer: Pointer };

interface ReadFacade {
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
}

interface BuildReadFacadeArgs<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
}

interface DocumentReadContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
}

export function buildReadFacade<S extends z.ZodType>(
  args: BuildReadFacadeArgs<S>,
): ReadFacade {
  const { schema, getState } = args;

  const context = (): DocumentReadContext<S> => ({
    schema,
    state: getState(),
  });

  const at = (path: Pointer): ReadResult => readDocumentPointer(getState(), path);

  return {
    at,
    exists(path) {
      return at(path).ok;
    },
    query(jsonpath) {
      return queryDocumentPointers(getState(), jsonpath);
    },
    entries(path) {
      return readDocumentEntries(context(), path);
    },
  };
}

function readDocumentPointer(state: unknown, path: Pointer): ReadResult {
  let segments: string[];
  try {
    segments = parsePointer(path);
  } catch (error) {
    return {
      ok: false,
      code: "invalid_pointer",
      reason: error instanceof Error ? error.message : "invalid pointer",
      pointer: path,
    };
  }

  const result = readAt(state, segments);
  if (!result.ok) {
    return {
      ok: false,
      code: "path_not_found",
      reason: `path not found: ${path}`,
      pointer: path,
    };
  }
  return { ok: true, path, value: result.value };
}

function queryDocumentPointers(state: unknown, jsonpath: string): QueryResult {
  try {
    return { ok: true, query: jsonpath, pointers: jsonpathQuery(jsonpath, state) };
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) {
      return { ok: false, code: "invalid_query", reason: error.message };
    }
    throw error;
  }
}

function readDocumentEntries<S extends z.ZodType>(
  context: DocumentReadContext<S>,
  path: Pointer,
): EntriesResult {
  const result = readDocumentPointer(context.state, path);
  if (!result.ok) return result;

  const plan = planDocumentEntries({
    schema: context.schema,
    path,
    value: result.value,
  });
  return {
    ok: true,
    path,
    kind: plan.kind,
    entries: plan.entries,
  };
}

function planDocumentEntries(
  input: PlanDocumentEntriesInput,
): DocumentEntriesPlan {
  return {
    kind: entryKind(input.schema, input.path, input.value),
    entries: readEntries(input.path, input.value),
  };
}

function entryKind(schema: z.ZodType, path: Pointer, value: unknown): EntryKind {
  if (path === "") return "root";
  if (Array.isArray(value)) return "array";
  if (isPlainRecord(value)) {
    const targetSchema = schemaAtPointer(schema, path);
    return targetSchema && getDef(targetSchema).type === "record" ? "record" : "object";
  }
  return "primitive";
}

function readEntries(path: Pointer, value: unknown): ReadonlyArray<ReadEntry> {
  if (Array.isArray(value)) {
    return value.map((entryValue, index) => ({
      key: String(index),
      path: appendSegment(path, index),
      value: entryValue,
    }));
  }

  if (isPlainRecord(value)) {
    return Object.entries(value).map(([key, entryValue]) => ({
      key,
      path: appendSegment(path, key),
      value: entryValue,
    }));
  }

  return [];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
