// commands/buildCommands — JSONDocument.commands group (TipTap 식 디팩토).
// 편집 어휘 10 verbs 를 단일 namespace 로 노출. doc.commands.X(...) 호출.
//
// commands 는 mutation 시 ops.patch (history commit + listener notify) 를 거친다.
// undo/redo 는 ops.undo/redo (history stack 관리는 createJSONDocument 가 wiring).

import type * as z from "zod";
import type { JSONDocumentOps } from "../jsonOps.js";
import type { Pointer } from "../core/pointer/index.js";
import {
  EMPTY_SELECTION,
  extendSelectionCursor,
  moveSelectionCursor,
  primaryPointer,
  selectedSource,
  selectSelectionScope,
} from "../core/selection/index.js";
import type {
  JSONPoint,
  SelectionAction,
  SelectionCursorDirection,
  SelectionCursorOptions,
  SelectionCursorResult,
  SelectionMode,
  SelectionRange,
  SelectionScopeOptions,
  SelectionScopeResult,
  SelectionSnap,
} from "../core/selection/index.js";
import { select as selectVerb } from "../verbs/select.js";
import { cut, type CutOk, type CutError } from "../verbs/cut.js";
import { copy, type ClipboardSource, type CopyOk, type CopyError } from "../verbs/copy.js";
import { paste, resolvePasteArgs, type PasteOk, type PasteError, type PasteDuMismatch, type PasteMode, type PasteOptions } from "../verbs/paste.js";
import { duplicate, resolveDuplicateArgs, type DuplicateOk, type DuplicateError, type DuplicateOpts } from "../verbs/duplicate.js";
import { move as moveVerb, resolveMoveArgs, type MoveError, type MoveResult } from "../verbs/move.js";
import { find, type FindOk, type FindError } from "../verbs/find.js";
import type { JSONPatchOperation, JSONResult } from "../core/patch/index.js";

export type ReplaceCommandResult =
  | JSONResult
  | { ok: false; code: "empty_selection"; reason: string };

export interface Commands<T> {
  select(action: SelectionAction, mode?: SelectionMode): SelectionSnap;
  selectScope(options?: SelectionScopeOptions): SelectionScopeResult;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): SelectionCursorResult;
  find(jsonpath: string): FindOk | FindError;

  move(fromOrTo: Pointer, to?: Pointer): MoveResult<T>;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): DuplicateOk<T> | DuplicateError;
  // RFC 6901 Pointer-based (commands surface 어휘 일관성). JSONPath multi-match 는 commands.find + ops.patch 로 합성.
  replace(pathOrValue: Pointer | unknown, value?: unknown): ReplaceCommandResult;

  cut(source?: ClipboardSource): CutOk<T> | CutError;
  copy(source?: ClipboardSource): CopyOk | CopyError;
  paste(
    payload: unknown,
    targetOrMode?: Pointer | PasteMode,
    modeOrOptions?: PasteMode | PasteOptions,
    options?: PasteOptions,
  ): PasteOk<T> | PasteError | PasteDuMismatch;

  undo(): boolean;
  redo(): boolean;
}

export interface CommandSelectionState extends SelectionSnap {
  selectRanges?(
    ranges: ReadonlyArray<JSONPoint | SelectionRange>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
}

export interface CreateCommandsOptions<S extends z.ZodType> {
  schema: S;
  ops: JSONDocumentOps<z.output<S>>;
  selectionRef?: { current: CommandSelectionState };
  selectionMode?: SelectionMode;
}

export type BuildCommandsArgs<S extends z.ZodType> = CreateCommandsOptions<S>;

interface MutationResult<T> {
  ok: boolean;
  patch?: ReadonlyArray<JSONPatchOperation>;
}

export function buildCommands<S extends z.ZodType>(
  args: CreateCommandsOptions<S>,
): Commands<z.output<S>> {
  const { schema, ops, selectionRef, selectionMode = "single" } = args;

  // mutating verb 의 결과를 받아 ok 면 history commit. result 그대로 반환.
  // commit 은 ops.patch 가 listener notify + history 등록까지 처리.
  const run = <R extends MutationResult<unknown>>(r: R): R => {
    if (r.ok && r.patch) ops.patch(r.patch);
    return r;
  };
  const selectionState = (): CommandSelectionState => selectionRef?.current ?? EMPTY_SELECTION;
  const sourceOrSelection = (source?: ClipboardSource): ClipboardSource | null =>
    source ?? selectedSource(selectionState());
  const targetOrSelection = (target?: Pointer): Pointer | null =>
    target ?? primaryPointer(selectionState());
  const primarySourceOrSelection = (source?: Pointer): Pointer | null =>
    source ?? primaryPointer(selectionState());

  return {
    select(action, mode = selectionMode) {
      const next = selectVerb(selectionState(), action, mode, ops.state);
      selectionRef?.current.selectRanges?.(next.selectionRanges, next.anchor, next.focus, next.primaryIndex);
      return next;
    },
    selectScope(options) {
      const result = selectSelectionScope(selectionState(), selectionMode, ops.state, options);
      if (result.ok) {
        selectionRef?.current.selectRanges?.(
          result.selection.selectionRanges,
          result.selection.anchor,
          result.selection.focus,
          result.selection.primaryIndex,
        );
      }
      return result;
    },
    moveCursor(direction, options) {
      const result = moveSelectionCursor(selectionState(), direction, selectionMode, ops.state, options);
      if (result.ok) {
        selectionRef?.current.selectRanges?.(
          result.selection.selectionRanges,
          result.selection.anchor,
          result.selection.focus,
          result.selection.primaryIndex,
        );
      }
      return result;
    },
    extendCursor(direction, options) {
      const result = extendSelectionCursor(selectionState(), direction, selectionMode, ops.state, options);
      if (result.ok) {
        selectionRef?.current.selectRanges?.(
          result.selection.selectionRanges,
          result.selection.anchor,
          result.selection.focus,
          result.selection.primaryIndex,
        );
      }
      return result;
    },
    find(jsonpath) {
      return find(ops.state, jsonpath);
    },

    move(fromOrTo, maybeTo) {
      const args = resolveMoveArgs(fromOrTo, maybeTo, arguments.length >= 2);
      const source = primarySourceOrSelection(args.from);
      return source === null
        ? emptyMoveSource()
        : run(moveVerb(schema, ops.state, source, args.to));
    },
    duplicate(sourceOrOpts, maybeOpts) {
      const args = resolveDuplicateArgs(sourceOrOpts, maybeOpts);
      const source = primarySourceOrSelection(args.source);
      return source === null
        ? emptyDuplicateSource()
        : run(duplicate(schema, ops.state, source, args.opts));
    },
    replace(pathOrValue, maybeValue) {
      // 다른 mutating verb 와 동일하게 ops.patch 경유 (history commit + listener notify).
      const args = resolveReplaceArgs(pathOrValue, maybeValue, arguments.length >= 2);
      const target = targetOrSelection(args.target);
      return target === null
        ? emptyReplaceTarget()
        : ops.patch([{ op: "replace", path: target, value: args.value }]);
    },

    cut(source) {
      const resolved = sourceOrSelection(source);
      return resolved === null
        ? emptyCutSource()
        : run(cut(schema, ops.state, resolved));
    },
    copy(source) {
      const resolved = sourceOrSelection(source);
      return resolved === null
        ? emptyCopySource()
        : copy(ops.state, resolved);
    },
    paste(payload, targetOrMode, modeOrOptions, maybeOptions) {
      const args = resolvePasteArgs(targetOrMode, modeOrOptions, maybeOptions);
      const target = targetOrSelection(args.target);
      return target === null
        ? emptyPasteTarget()
        : run(paste(schema, ops.state, payload, target, args.mode, args.options));
    },

    undo() { return ops.undo(); },
    redo() { return ops.redo(); },
  };
}

export const createCommands = buildCommands;

function emptyPasteTarget(): PasteError {
  return {
    ok: false,
    code: "empty_selection",
    message: "paste target selection is empty",
  };
}

function emptyMoveSource(): MoveError {
  return {
    ok: false,
    code: "empty_selection",
    message: "move source selection is empty",
  };
}

function emptyCutSource(): CutError {
  return {
    ok: false,
    code: "empty_selection",
    message: "cut source selection is empty",
  };
}

function emptyCopySource(): CopyError {
  return {
    ok: false,
    code: "empty_selection",
    message: "copy source selection is empty",
  };
}

function emptyReplaceTarget(): ReplaceCommandResult {
  return {
    ok: false,
    code: "empty_selection",
    reason: "replace target selection is empty",
  };
}

function emptyDuplicateSource(): DuplicateError {
  return {
    ok: false,
    code: "empty_selection",
    message: "duplicate source selection is empty",
  };
}

function resolveReplaceArgs(
  pathOrValue: Pointer | unknown,
  value: unknown,
  hasValueArg: boolean,
): { target?: Pointer; value: unknown } {
  return hasValueArg
    ? { target: pathOrValue as Pointer, value }
    : { value: pathOrValue };
}
