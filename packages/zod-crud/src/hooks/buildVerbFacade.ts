// hooks/buildVerbFacade — useJsonDocument 의 6 verb facade 메서드 빌더.
// 격차 1+2 해소: facade 가 verbs/* 위에 서고, 사용자가 doc.cut/copy/paste/find/replace/duplicate
// 를 직접 호출 가능하게 한다 (ADR-0002 §0.5 layer 규약).
//
// 정합 메모리:
//   feedback_verbs_layering — verbs 는 명시 인자 pure, hooks 가 sugar (selection 자동 주입은 향후).
//   project_zod_crud_pillars_verbs_map — 4대 기둥 ↔ 10 verbs.

import type * as z from "zod";
import type { JsonOps } from "./useJson.js";
import type { Pointer } from "../core/pointer/index.js";
import { cut, type CutOk, type CutError } from "../verbs/cut.js";
import { copy, type CopyOk, type CopyError } from "../verbs/copy.js";
import { paste, type PasteOk, type PasteError, type PasteMode } from "../verbs/paste.js";
import { duplicate, type DuplicateOk, type DuplicateError, type DuplicateOpts } from "../verbs/duplicate.js";
import { find, type FindOk, type FindError } from "../verbs/find.js";
import { replace as replaceVerb, type ReplaceOk, type ReplaceError } from "../verbs/replace.js";

export interface VerbFacade<T> {
  /** Clipboard 기둥 — copy: source 위치 값을 JSON fragment payload 로 추출 (read-only). */
  copy(source: Pointer): CopyOk | CopyError;
  /** Clipboard 기둥 — cut: copy + RFC 6902 remove (atomic, history commit). */
  cut(source: Pointer): CutOk<T> | CutError;
  /** Clipboard 기둥 — paste: payload 를 target 에 삽입 (history commit). */
  paste(payload: unknown, target: Pointer, mode?: PasteMode): PasteOk<T> | PasteError;
  /** Edit 기둥 — duplicate: in-place 형제 복제 (history commit). */
  duplicate(source: Pointer, opts?: DuplicateOpts): DuplicateOk<T> | DuplicateError;
  /** Selection 기둥 — find: RFC 9535 query 로 pointer + match 산출 (read-only). */
  find(jsonpath: string): FindOk | FindError;
  /** Edit 기둥 — replace: RFC 9535 query 결과에 replace patch 일괄 적용 (history commit). */
  replace(jsonpath: string, value: unknown): ReplaceOk<T> | ReplaceError;
}

/**
 * verbs/* 의 pure 함수를 useJsonDocument 의 ops.patch 에 wiring 한다.
 * mutating verb 의 patch 는 ops.patch 로 commit (history 자동 등록).
 * read-only verb (copy / find) 는 state 만 읽고 patch 없음.
 */
export function buildVerbFacade<S extends z.ZodType>(
  schema: S,
  ops: JsonOps<z.output<S>>,
): VerbFacade<z.output<S>> {
  const commit = (patch: ReadonlyArray<{ op: string }>): void => {
    // ops.patch 가 history + listener notify 를 자동 처리.
    ops.patch(patch as never);
  };

  return {
    copy(source) {
      return copy(ops.state, source);
    },

    cut(source) {
      const r = cut(schema, ops.state, source);
      if (r.ok) commit(r.patch);
      return r;
    },

    paste(payload, target, mode = "into") {
      const r = paste(schema, ops.state, payload, target, mode);
      if (r.ok) commit(r.patch);
      return r;
    },

    duplicate(source, opts) {
      const r = duplicate(schema, ops.state, source, opts);
      if (r.ok) commit(r.patch);
      return r;
    },

    find(jsonpath) {
      return find(ops.state, jsonpath);
    },

    replace(jsonpath, value) {
      const r = replaceVerb(schema, ops.state, jsonpath, value);
      if (r.ok) commit(r.patch);
      return r;
    },
  };
}
