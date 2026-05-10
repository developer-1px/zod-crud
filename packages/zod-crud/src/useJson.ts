import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type * as z from "zod";

import { createJsonCrud, type JsonCrud } from "./json-crud.js";
import type { JsonValue, NodeId } from "./types.js";

export type JsonPathSegment = string | number;
export type JsonPath = JsonPathSegment | JsonPathSegment[];

export type JsonResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | { ok: false; code: string; reason?: string };

export interface JsonOps<T> {
  set(path: JsonPath, value: unknown): JsonResult;
  insert(path: JsonPath, value: unknown, at?: number): JsonResult;
  delete(path: JsonPath | JsonPath[]): JsonResult;
  move(from: JsonPath, to: JsonPath): JsonResult;
  rename(path: JsonPath, key: string): JsonResult;
  reset(value?: T): void;
  load(value: T): JsonResult;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface UseJsonOptions {
  history?: boolean;
  onError?: (result: Extract<JsonResult, { ok: false }>) => void;
}

function toSegments(path: JsonPath): JsonPathSegment[] {
  return Array.isArray(path) ? path : [path];
}

function resolveNodeId(crud: JsonCrud, path: JsonPathSegment[]): NodeId | null {
  const doc = crud.snapshot();
  let nodeId: NodeId = doc.rootId;

  for (const segment of path) {
    const next = crud.find(nodeId, segment);
    if (next === null) return null;
    nodeId = next;
  }

  return nodeId;
}

function fail(code: string, reason?: string): Extract<JsonResult, { ok: false }> {
  return reason === undefined ? { ok: false, code } : { ok: false, code, reason };
}

export function useJson<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options: UseJsonOptions = {},
): [z.output<S>, JsonOps<z.output<S>>] {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const crud = useMemo(
    () => createJsonCrud(schema as never, initial as never) as JsonCrud,
    // schema/initial은 의도적으로 stable 가정 — 변경 시 reset/load 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const subscribe = useCallback(
    (notify: () => void) => crud.subscribe(() => notify()),
    [crud],
  );

  const getSnapshot = useCallback(() => crud.toJson(), [crud]);

  const json = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as z.output<S>;

  const ops = useMemo<JsonOps<z.output<S>>>(() => {
    const handle = <T,>(result: { ok: boolean; reason?: string; code?: string } | JsonResult<T>): JsonResult<T> => {
      const r = result as JsonResult<T>;
      if (!r.ok && optionsRef.current.onError) optionsRef.current.onError(r);
      return r;
    };

    return {
      set(path, value) {
        const segments = toSegments(path);
        const id = resolveNodeId(crud, segments);
        if (id === null) return handle(fail("not_found", `path: ${segments.join(".")}`));
        const r = crud.update(id, value as JsonValue);
        return handle(r.ok ? { ok: true } : fail(r.reason ?? "update_failed"));
      },
      insert(path, value, at) {
        const segments = toSegments(path);
        const parentId = resolveNodeId(crud, segments);
        if (parentId === null) return handle(fail("not_found", `path: ${segments.join(".")}`));

        if (at === undefined) {
          const r = crud.appendChild(parentId, value as JsonValue);
          return handle(r.ok ? { ok: true } : fail(r.reason ?? "insert_failed"));
        }

        const parent = crud.snapshot().nodes[parentId];
        if (!parent) return handle(fail("not_found"));
        const sibling = parent.children[at];
        if (sibling === undefined) {
          const r = crud.appendChild(parentId, value as JsonValue);
          return handle(r.ok ? { ok: true } : fail(r.reason ?? "insert_failed"));
        }
        const r = crud.insertBefore(sibling, value as JsonValue);
        return handle(r.ok ? { ok: true } : fail(r.reason ?? "insert_failed"));
      },
      delete(path) {
        const paths = Array.isArray(path) && Array.isArray(path[0])
          ? (path as JsonPath[])
          : [path as JsonPath];
        const ids: NodeId[] = [];
        for (const p of paths) {
          const id = resolveNodeId(crud, toSegments(p));
          if (id === null) return handle(fail("not_found"));
          ids.push(id);
        }
        const r = ids.length === 1 ? crud.delete(ids[0]!) : crud.deleteMany(ids);
        return handle(r.ok ? { ok: true } : fail(r.reason ?? "delete_failed"));
      },
      move(from, to) {
        const fromId = resolveNodeId(crud, toSegments(from));
        if (fromId === null) return handle(fail("not_found", "from"));

        const toSeg = toSegments(to);
        const lastIdx = toSeg[toSeg.length - 1];
        const parentSeg = toSeg.slice(0, -1);
        const parentId = resolveNodeId(crud, parentSeg);
        if (parentId === null) return handle(fail("not_found", "to.parent"));

        const index = typeof lastIdx === "number" ? lastIdx : null;
        const r = crud.moveInto([fromId], parentId, index ?? undefined);
        return handle(r.ok ? { ok: true } : fail(r.reason ?? "move_failed"));
      },
      rename(path, key) {
        const id = resolveNodeId(crud, toSegments(path));
        if (id === null) return handle(fail("not_found"));
        const r = crud.rename(id, key);
        return handle(r.ok ? { ok: true } : fail(r.reason ?? "rename_failed"));
      },
      reset(value) {
        // 현재는 instance 교체 불가 — load로 우회. 후속 wave에서 store 재구성으로 정리
        if (value !== undefined) ops.load(value);
      },
      load(value) {
        const parsed = (schema as z.ZodType).safeParse(value);
        if (!parsed.success) return handle(fail("schema_violation", parsed.error.message));
        const root = crud.snapshot().rootId;
        const r = crud.update(root, parsed.data as JsonValue);
        return handle(r.ok ? { ok: true } : fail(r.reason ?? "load_failed"));
      },
      undo() {
        return crud.undo().ok;
      },
      redo() {
        return crud.redo().ok;
      },
      canUndo() {
        return crud.canUndo();
      },
      canRedo() {
        return crud.canRedo();
      },
    };
  }, [crud, schema]);

  return [json, ops];
}
