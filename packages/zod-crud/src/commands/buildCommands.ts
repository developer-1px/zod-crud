// commands/buildCommands — useJSONDocument.commands group (TipTap 식 디팩토).
// 편집 어휘 10 verbs 를 단일 namespace 로 노출. doc.commands.X(...) 호출.
//
// commands 는 mutation 시 ops.patch (history commit + listener notify) 를 거친다.
// undo/redo 는 ops.undo/redo (history stack 관리는 useJSONDocument 가 wiring).

import type * as z from "zod";
import type { JSONDocumentOps } from "../jsonOps.js";
import type { Pointer } from "../core/pointer/index.js";
import type {
  JSONPoint,
  SelectionAction,
  SelectionMode,
  SelectionRange,
  SelectionSnap,
} from "../core/selection/index.js";
import { select as selectVerb } from "../verbs/select.js";
import { cut, type CutOk, type CutError } from "../verbs/cut.js";
import { copy, type CopyOk, type CopyError } from "../verbs/copy.js";
import { paste, type PasteOk, type PasteError, type PasteDuMismatch, type PasteMode } from "../verbs/paste.js";
import { duplicate, type DuplicateOk, type DuplicateError, type DuplicateOpts } from "../verbs/duplicate.js";
import { move as moveVerb, type MoveResult } from "../verbs/move.js";
import { find, type FindOk, type FindError } from "../verbs/find.js";
import type { JSONPatchOperation, JSONResult } from "../core/patch/index.js";

export interface Commands<T> {
  select(action: SelectionAction, mode?: SelectionMode): SelectionSnap;
  find(jsonpath: string): FindOk | FindError;

  move(from: Pointer, to: Pointer): MoveResult<T>;
  duplicate(source: Pointer, opts?: DuplicateOpts): DuplicateOk<T> | DuplicateError;
  // RFC 6901 Pointer-based (commands surface 어휘 일관성). JSONPath multi-match 는 commands.find + ops.patch 로 합성.
  replace(path: Pointer, value: unknown): JSONResult;

  cut(source: Pointer): CutOk<T> | CutError;
  copy(source: Pointer): CopyOk | CopyError;
  paste(payload: unknown, target: Pointer, mode?: PasteMode): PasteOk<T> | PasteError | PasteDuMismatch;

  undo(): boolean;
  redo(): boolean;
}

export interface BuildCommandsArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONDocumentOps<z.output<S>>;
  selectionRef: { current: SelectionHandle };
  selectionMode?: SelectionMode;
}

interface SelectionHandle extends SelectionSnap {
  selectRanges?(
    ranges: ReadonlyArray<SelectionRange>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
}

interface MutationResult<T> {
  ok: boolean;
  patch?: ReadonlyArray<JSONPatchOperation>;
}

export function buildCommands<S extends z.ZodType>(
  args: BuildCommandsArgs<S>,
): Commands<z.output<S>> {
  const { schema, ops, selectionRef, selectionMode = "single" } = args;

  // mutating verb 의 결과를 받아 ok 면 history commit. result 그대로 반환.
  // commit 은 ops.patch 가 listener notify + history 등록까지 처리.
  const run = <R extends MutationResult<unknown>>(r: R): R => {
    if (r.ok && r.patch) ops.patch(r.patch);
    return r;
  };

  return {
    select(action, mode = selectionMode) {
      const next = selectVerb(selectionRef.current, action, mode, ops.state);
      selectionRef.current.selectRanges?.(next.selectionRanges, next.anchor, next.focus, next.primaryIndex);
      return next;
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
    replace(path, value) {
      // 다른 mutating verb 와 동일하게 ops.patch 경유 (history commit + listener notify).
      return ops.patch([{ op: "replace", path, value }]);
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
