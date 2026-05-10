// commands/buildCan — useJsonDocument.can group (TipTap 식 디팩토).
// 각 mutation 가 현재 state 에서 성공할지 boolean 으로 반환.
// preFlight gate 까지 거쳐 정확한 답 산출 (UI 가드 용도).
//
// 비용 주의: 각 can 호출이 dry-apply + zod.safeParse. UI 에서 매 render 호출 시
// useMemo / useDeferredValue 로 캐싱 권장. canUndo/canRedo 는 stack 길이 검사라 저비용.

import type * as z from "zod";
import type { Pointer } from "../core/pointer/index.js";
import { cut } from "../verbs/cut.js";
import { copy } from "../verbs/copy.js";
import { paste, type PasteMode } from "../verbs/paste.js";
import { duplicate, type DuplicateOpts } from "../verbs/duplicate.js";
import { move as moveVerb } from "../verbs/move.js";
import { replace as replaceVerb } from "../verbs/replace.js";
import type { BuildCommandsArgs } from "./buildCommands.js";

export interface Can<T> {
  move(from: Pointer, to: Pointer): boolean;
  duplicate(source: Pointer, opts?: DuplicateOpts): boolean;
  replace(jsonpath: string, value: unknown): boolean;
  cut(source: Pointer): boolean;
  paste(payload: unknown, target: Pointer, mode?: PasteMode): boolean;
  copy(source: Pointer): boolean;

  readonly undo: boolean;
  readonly redo: boolean;
}

export type BuildCanArgs<S extends z.ZodType> = Pick<BuildCommandsArgs<S>, "schema" | "ops">;

export function buildCan<S extends z.ZodType>(args: BuildCanArgs<S>): Can<z.output<S>> {
  const { schema, ops } = args;
  return {
    move(from, to) { return moveVerb(schema, ops.state, from, to).ok; },
    duplicate(source, opts) { return duplicate(schema, ops.state, source, opts).ok; },
    replace(jsonpath, value) { return replaceVerb(schema, ops.state, jsonpath, value).ok; },
    cut(source) { return cut(schema, ops.state, source).ok; },
    paste(payload, target, mode = "into") { return paste(schema, ops.state, payload, target, mode).ok; },
    copy(source) { return copy(ops.state, source).ok; },

    get undo() { return ops.canUndo(); },
    get redo() { return ops.canRedo(); },
  };
}
