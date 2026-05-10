// commands/buildCommands — useJsonDocument.commands group (TipTap 식 디팩토).
// 편집도구 어휘 10 verbs 를 단일 namespace 로 노출. doc.commands.X(...) 호출.
//
// commands 는 mutation 시 ops.patch (history commit + listener notify) 를 거친다.
// undo/redo 는 ops.undo/redo (history stack 관리는 useJsonDocument 가 wiring).

import type * as z from "zod";
import type { JsonOps } from "../hooks/useJson.js";
import type { Pointer } from "../core/pointer/index.js";
import type {
  SelectionAction,
  SelectionSnap,
  SelectionMode,
} from "../core/selection/index.js";
import { select as selectVerb } from "../verbs/select.js";
import { cut, type CutOk, type CutError } from "../verbs/cut.js";
import { copy, type CopyOk, type CopyError } from "../verbs/copy.js";
import { paste, type PasteOk, type PasteError, type PasteMode } from "../verbs/paste.js";
import { duplicate, type DuplicateOk, type DuplicateError, type DuplicateOpts } from "../verbs/duplicate.js";
import { move as moveVerb, type MoveResult, type MoveError } from "../verbs/move.js";
import { find, type FindOk, type FindError } from "../verbs/find.js";
import { replace as replaceVerb, type ReplaceOk, type ReplaceError } from "../verbs/replace.js";
import type { JsonPatchOperation } from "../core/patch/index.js";

export interface Commands<T> {
  select(action: SelectionAction, mode?: SelectionMode): SelectionSnap;
  find(jsonpath: string): FindOk | FindError;

  move(from: Pointer, to: Pointer): MoveResult<T> | MoveError;
  duplicate(source: Pointer, opts?: DuplicateOpts): DuplicateOk<T> | DuplicateError;
  replace(jsonpath: string, value: unknown): ReplaceOk<T> | ReplaceError;

  cut(source: Pointer): CutOk<T> | CutError;
  copy(source: Pointer): CopyOk | CopyError;
  paste(payload: unknown, target: Pointer, mode?: PasteMode): PasteOk<T> | PasteError;

  undo(): boolean;
  redo(): boolean;
}

export interface BuildCommandsArgs<S extends z.ZodType> {
  schema: S;
  ops: JsonOps<z.output<S>>;
  selectionRef: { current: SelectionSnap };
}

interface MutationResult<T> {
  ok: boolean;
  patch?: ReadonlyArray<JsonPatchOperation>;
}

export function buildCommands<S extends z.ZodType>(
  args: BuildCommandsArgs<S>,
): Commands<z.output<S>> {
  const { schema, ops, selectionRef } = args;

  // mutating verb 의 결과를 받아 ok 면 history commit. result 그대로 반환.
  // commit 은 ops.patch 가 listener notify + history 등록까지 처리.
  const run = <R extends MutationResult<unknown>>(r: R): R => {
    if (r.ok && r.patch) ops.patch(r.patch);
    return r;
  };

  return {
    select(action, mode = "single") {
      // selectionRef.current 는 SelectionSnap 형태. selectVerb 는 pure 라 직접 전달.
      return selectVerb(selectionRef.current, action, mode);
    },
    find(jsonpath) {
      return find(ops.state, jsonpath);
    },

    move(from, to) {
      return run(moveVerb(schema, ops.state, from, to));
    },
    duplicate(source, opts) {
      return run(duplicate(schema, ops.state, source, opts));
    },
    replace(jsonpath, value) {
      return run(replaceVerb(schema, ops.state, jsonpath, value));
    },

    cut(source) {
      return run(cut(schema, ops.state, source));
    },
    copy(source) {
      return copy(ops.state, source);
    },
    paste(payload, target, mode = "into") {
      return run(paste(schema, ops.state, payload, target, mode));
    },

    undo() { return ops.undo(); },
    redo() { return ops.redo(); },
  };
}
