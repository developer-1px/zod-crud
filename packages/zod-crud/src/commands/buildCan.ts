// commands/buildCan — useJSONDocument.can group (TipTap 식 디팩토).
// 각 mutation 가 현재 state 에서 성공할지 boolean 으로 반환.
// preFlight gate 까지 거쳐 정확한 답 산출 (UI 가드 용도).
//
// 비용 주의: 각 can 호출이 dry-apply + zod.safeParse. UI 에서 매 render 호출 시
// useMemo / useDeferredValue 로 캐싱 권장. canUndo/canRedo 는 stack 길이 검사라 저비용.

import type * as z from "zod";
import type { Pointer } from "../core/pointer/index.js";
import type { PasteMode } from "../verbs/paste.js";
import type { DuplicateOpts } from "../verbs/duplicate.js";
import { buildCheck, type BuildCheckArgs, type Check } from "../check.js";

export interface Can<T> {
  move(from: Pointer, to: Pointer): boolean;
  duplicate(source: Pointer, opts?: DuplicateOpts): boolean;
  replace(path: Pointer, value: unknown): boolean;
  cut(source: Pointer): boolean;
  paste(payload: unknown, target: Pointer, mode?: PasteMode): boolean;
  copy(source: Pointer): boolean;

  readonly undo: boolean;
  readonly redo: boolean;
}

export interface BuildCanArgs<S extends z.ZodType> extends BuildCheckArgs<S> {
  check?: Check<z.output<S>>;
}

export function buildCan<S extends z.ZodType>(args: BuildCanArgs<S>): Can<z.output<S>> {
  const check = args.check ?? buildCheck(args);
  return {
    move(from, to) { return check.move(from, to).ok; },
    duplicate(source, opts) { return check.duplicate(source, opts).ok; },
    replace(path, value) { return check.replace(path, value).ok; },
    cut(source) { return check.cut(source).ok; },
    paste(payload, target, mode = "into") { return check.paste(payload, target, mode).ok; },
    copy(source) { return check.copy(source).ok; },

    get undo() { return check.undo.ok; },
    get redo() { return check.redo.ok; },
  };
}
