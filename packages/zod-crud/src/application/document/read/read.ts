import type * as z from "zod";
import { query as jsonpathQuery } from "../../../foundation/jsonpath/index.js";
import { JSONPathSyntaxError } from "../../../foundation/jsonpath/tokenize.js";
import { appendSegment, parsePointer, readAt, type Pointer } from "../../../foundation/pointer/index.js";
import { schemaAtPointer } from "../../../domain/schema/introspection.js";
import { getDef } from "../../../domain/schema/zod.js";
import type {
  EntriesResult,
  EntryKind,
  QueryResult,
  ReadEntry,
  ReadResult,
} from "./types.js";

export interface DocumentReadState {
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
}

export function createDocumentRead<S extends z.ZodType>(
  schema: S,
  getState: () => unknown,
): DocumentReadState {
  const at = (path: Pointer): ReadResult => readDocumentPointer(getState(), path);
  const query = (jsonpath: string): QueryResult => queryDocumentPointers(getState(), jsonpath);

  return {
    at,
    exists: (path) => at(path).ok,
    query,
    entries: (path) => readDocumentEntries(schema, getState(), path),
  };
}

function queryDocumentPointers(state: unknown, jsonpath: string): QueryResult {
  try {
    return { ok: true, query: jsonpath, pointers: jsonpathQuery(jsonpath, state) };
  } catch (error) {
    if (error instanceof JSONPathSyntaxError) return { ok: false, code: "invalid_query", reason: error.message };
    throw error;
  }
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
  return result.ok
    ? { ok: true, path, value: result.value }
    : {
        ok: false,
        code: "path_not_found",
        reason: `path not found: ${path}`,
        pointer: path,
      };
}

function readDocumentEntries(schema: z.ZodType, state: unknown, path: Pointer): EntriesResult {
  const result = readDocumentPointer(state, path);
  if (!result.ok) return result;
  return {
    ok: true,
    path,
    kind: entryKind(schema, path, result.value),
    entries: readChildEntries(path, result.value),
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

function readChildEntries(path: Pointer, value: unknown): ReadonlyArray<ReadEntry> {
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
