import type * as z from "zod";

import { query as jsonpathQuery, JSONPathSyntaxError } from "./core/jsonpath/index.js";
import { appendSegment, parsePointer, readAt, type Pointer } from "./core/pointer/index.js";
import { getDef, schemaAtPointer } from "./core/schema/introspection.js";

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

export interface ReadFacade {
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
}

export interface BuildReadFacadeArgs<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
}

export function buildReadFacade<S extends z.ZodType>(
  args: BuildReadFacadeArgs<S>,
): ReadFacade {
  const { schema, getState } = args;

  const at = (path: Pointer): ReadResult => {
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

    const result = readAt(getState(), segments);
    if (!result.ok) {
      return {
        ok: false,
        code: "path_not_found",
        reason: `path not found: ${path}`,
        pointer: path,
      };
    }
    return { ok: true, path, value: result.value };
  };

  return {
    at,
    exists(path) {
      return at(path).ok;
    },
    query(jsonpath) {
      try {
        return { ok: true, query: jsonpath, pointers: jsonpathQuery(jsonpath, getState()) };
      } catch (error) {
        if (error instanceof JSONPathSyntaxError) {
          return { ok: false, code: "invalid_query", reason: error.message };
        }
        throw error;
      }
    },
    entries(path) {
      const result = at(path);
      if (!result.ok) return result;

      return {
        ok: true,
        path,
        kind: entryKind(schema, path, result.value),
        entries: readEntries(path, result.value),
      };
    },
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
