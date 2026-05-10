// hooks/buildCommands — useJsonDocument.commands group (TipTap 식 디팩토).
// 편집도구 어휘 10 verbs 를 단일 namespace 로 노출. doc.commands.X(...) 호출.
//
// 정합 메모리:
//   feedback_verbs_layering — verbs 는 명시 인자 pure, hooks 가 facade 에서 합성.
//   project_zod_crud_pillars_verbs_map — 4대 기둥 ↔ 10 verbs.
//
// commands 는 mutation 시 ops.patch (history commit + listener notify) 를 거친다.
// undo/redo 는 useJsonDocument 의 history stack ref 를 통해 라우팅 — 외부에서 주입.

import type * as z from "zod";
import type { JsonOps } from "./useJson.js";
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

export interface Commands<T> {
  // Selection 기둥
  select(action: SelectionAction, mode?: SelectionMode): SelectionSnap;
  find(jsonpath: string): FindOk | FindError;

  // Edit 기둥
  move(from: Pointer, to: Pointer): MoveResult<T> | MoveError;
  duplicate(source: Pointer, opts?: DuplicateOpts): DuplicateOk<T> | DuplicateError;
  replace(jsonpath: string, value: unknown): ReplaceOk<T> | ReplaceError;

  // Clipboard 기둥
  cut(source: Pointer): CutOk<T> | CutError;
  copy(source: Pointer): CopyOk | CopyError;
  paste(payload: unknown, target: Pointer, mode?: PasteMode): PasteOk<T> | PasteError;

  // Undo 기둥
  undo(): boolean;
  redo(): boolean;
}

export interface BuildCommandsArgs<S extends z.ZodType> {
  schema: S;
  ops: JsonOps<z.output<S>>;
  selectionRef: { current: { ranges: ReadonlyArray<Pointer>; anchor: Pointer | null; focus: Pointer | null } };
}

export function buildCommands<S extends z.ZodType>(
  args: BuildCommandsArgs<S>,
): Commands<z.output<S>> {
  const { schema, ops } = args;
  const commit = (patch: ReadonlyArray<{ op: string }>): void => {
    ops.patch(patch as never);
  };

  return {
    // Selection
    select(action, mode = "single") {
      // selection 변경은 hooks/useSelection 의 reducer 를 통해 외부에서 처리하는 게 정합.
      // 여기서는 현재 selection 의 다음 상태만 반환 (read-only 합성).
      const cur: SelectionSnap = {
        ranges: [...args.selectionRef.current.ranges],
        anchor: args.selectionRef.current.anchor,
        focus: args.selectionRef.current.focus,
      };
      return selectVerb(cur, action, mode);
    },
    find(jsonpath) {
      return find(ops.state, jsonpath);
    },

    // Edit
    move(from, to) {
      const r = moveVerb(schema, ops.state, from, to);
      if (r.ok) commit(r.patch);
      return r;
    },
    duplicate(source, opts) {
      const r = duplicate(schema, ops.state, source, opts);
      if (r.ok) commit(r.patch);
      return r;
    },
    replace(jsonpath, value) {
      const r = replaceVerb(schema, ops.state, jsonpath, value);
      if (r.ok) commit(r.patch);
      return r;
    },

    // Clipboard
    cut(source) {
      const r = cut(schema, ops.state, source);
      if (r.ok) commit(r.patch);
      return r;
    },
    copy(source) {
      return copy(ops.state, source);
    },
    paste(payload, target, mode = "into") {
      const r = paste(schema, ops.state, payload, target, mode);
      if (r.ok) commit(r.patch);
      return r;
    },

    // Undo
    undo() { return ops.undo(); },
    redo() { return ops.redo(); },
  };
}
