// commands/buildCan — useJSONDocument.can group (TipTap 식 디팩토).
// 각 mutation 가 현재 state 에서 성공할지 boolean 으로 반환.
// preFlight gate 까지 거쳐 정확한 답 산출 (UI 가드 용도).
//
// 비용 주의: 각 can 호출이 dry-apply + zod.safeParse. UI 에서 매 render 호출 시
// useMemo / useDeferredValue 로 캐싱 권장. canUndo/canRedo 는 stack 길이 검사라 저비용.

import type * as z from "zod";
import type { Pointer } from "../core/pointer/index.js";
import type { PasteMode, PasteOptions } from "../verbs/paste.js";
import type { DuplicateOpts } from "../verbs/duplicate.js";
import type { ClipboardSource } from "../verbs/copy.js";
import { buildCheck, type BuildCheckArgs, type Check } from "../check.js";

export interface Can<T> {
  move(fromOrTo: Pointer, to?: Pointer): boolean;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): boolean;
  replace(pathOrValue: Pointer | unknown, value?: unknown): boolean;
  cut(source?: ClipboardSource): boolean;
  paste(
    payload: unknown,
    targetOrMode?: Pointer | PasteMode,
    modeOrOptions?: PasteMode | PasteOptions,
    options?: PasteOptions,
  ): boolean;
  copy(source?: ClipboardSource): boolean;

  readonly undo: boolean;
  readonly redo: boolean;
}

export interface BuildCanArgs<S extends z.ZodType> extends BuildCheckArgs<S> {
  check?: Check<z.output<S>>;
}

export type CreateCanOptions<S extends z.ZodType> = BuildCanArgs<S>;

export function buildCan<S extends z.ZodType>(args: CreateCanOptions<S>): Can<z.output<S>> {
  const check = args.check ?? buildCheck(args);
  return {
    move(fromOrTo, maybeTo) {
      return arguments.length >= 2
        ? check.move(fromOrTo, maybeTo).ok
        : check.move(fromOrTo).ok;
    },
    duplicate(source, opts) { return check.duplicate(source, opts).ok; },
    replace(pathOrValue, maybeValue) {
      return arguments.length >= 2
        ? check.replace(pathOrValue, maybeValue).ok
        : check.replace(pathOrValue).ok;
    },
    cut(source) { return check.cut(source).ok; },
    paste(payload, target, mode = "into", options = {}) { return check.paste(payload, target, mode, options).ok; },
    copy(source) { return check.copy(source).ok; },

    get undo() { return check.undo.ok; },
    get redo() { return check.redo.ok; },
  };
}

export const createCan = buildCan;
