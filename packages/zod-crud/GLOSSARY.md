# GLOSSARY — zod-crud vocabulary

이 문서는 현재 코드에서 실제로 쓰는 어휘만 둔다. 코드 동작이 정본이고, 이 파일은 그 동작을 설명한다.

## Core Identity

| 용어 | 의미 |
|------|------|
| `createJSONDocument` | 루트 `zod-crud` 의 headless document facade. React 없이 `value`, `ops`, `selection`, `history`, `commands`, `can` 을 제공한다. |
| `useJSONDocument` | `zod-crud/react` 의 React document facade. `createJSONDocument` 와 같은 표면을 React state/render lifecycle 위에 얹는다. |
| `JSONDocument<T>` | `createJSONDocument` / `useJSONDocument` 반환 타입. |
| 4대 기둥 | Selection, Edit, Clipboard, Undo. 10 verbs 분류 기준. |
| 10 verbs | `select`, `move`, `cut`, `copy`, `paste`, `duplicate`, `undo`, `redo`, `find`, `replace`. |
| hooks/commands/verbs/core | 현재 코드 위계. hooks 는 React, commands 는 facade builder, verbs 는 pure composer, core 는 RFC substrate. |
| sidecars | 본체 데이터 흐름 밖의 횡단 관심사. `recorder`, `debug-log`, `http`. |

## JSON Standards

| 용어 | 의미 |
|------|------|
| JSON Pointer | RFC 6901 path 표현. zod-crud 의 모든 좌표 정본. |
| `Pointer` | RFC 6901 JSON Pointer 문자열 타입 alias. |
| `PointerOf<T>` | schema 타입 T 에서 가능한 Pointer 문자열 union 을 도출하는 빌드 타임 타입. |
| `ValueAt<T, P>` | T 에서 Pointer P 가 가리키는 값의 타입. |
| `parsePointer(pointer)` | Pointer 문자열을 이스케이프 디코드된 segment 배열로 변환. |
| `buildPointer(segments)` | segment 배열을 Pointer 문자열로 변환. |
| `escapeSegment` / `unescapeSegment` | RFC 6901 segment 이스케이프 helper. |
| JSON Patch | RFC 6902 변경 표현. `add`, `remove`, `replace`, `move`, `copy`, `test` 6 op. |
| `JSONPatchOperation` | RFC 6902 op discriminated union. |
| `JSONResult` | op 실행 결과. `{ ok: true }` 또는 `{ ok: false, code, reason?, pointer? }`. |
| JSONPath | RFC 9535 query 표현. `commands.find` 와 `core/jsonpath/` 의 substrate. |

## Ops

| 용어 | 의미 |
|------|------|
| `JSONOps<T>` | low-level ops 표면. RFC 6902 6 op, `set`, `patch`, `apply`, lifecycle, subscribe, state 를 제공. `JSONDocument.ops` 는 여기에 facade undo/redo control 을 더한다. |
| `set(path, value)` | RFC 6902 op 는 아니며, add/replace/remove 를 idempotent 하게 합성하는 ops sugar. |
| `patch(operations)` | RFC 6902 batch. 한 op 실패 시 전체 rollback. |
| `apply(operations)` | 실패 시 `JSONCrudError` 를 throw 하는 fire-and-forget patch path. |
| `load(value)` | 외부 JSON 을 schema 검증 후 state 로 교체. |
| `reset(value?)` | initial 또는 인자 값으로 state 교체. |
| `subscribe(listener)` | commit 된 patch 목록을 구독한다. Selection 자동 추적과 sidecars 가 사용한다. |
| `state` | 현재 JSON state snapshot. |
| `JSONChangeListener` | `(applied: ReadonlyArray<JSONPatchOperation>) => void`. |

## Selection

| 용어 | 의미 |
|------|------|
| `SelectionState<T>` | `useSelection` 반환 타입. Pointer 집합과 anchor/focus, selection action methods 를 제공. |
| `SelectionSnap` | 순수 selection snapshot. `{ ranges, anchor, focus }`. |
| `ranges` | 현재 선택된 Pointer 배열. |
| `anchor` | W3C Selection API 의 range 시작 좌표. |
| `focus` | W3C Selection API 의 range 끝 좌표. 별도 hook 축이 아니라 selection 내부 좌표다. |
| `SelectionMode` | `"single"`, `"multiple"`, `"extended"`. WAI-ARIA selection 어휘와 정합. |
| `SelectionType` | `"None"`, `"Caret"`, `"Range"`. |
| collapsed selection | `anchor === focus` 이고 `ranges.length === 1` 인 selection. 캐럿으로 본다. |
| `trackPointer` | RFC 6902 op 적용 후 Pointer 하나가 어디로 이동했는지 계산하는 helper. |

## Commands

| 용어 | 의미 |
|------|------|
| `commands` | 10 verbs 를 노출하는 facade namespace. |
| `can` | mutation guard namespace. 현재 state 에서 command 가 가능한지 boolean 으로 답한다. |
| `source` | copy/cut/duplicate 의 원본 Pointer. |
| `target` | paste 의 목적지 Pointer. |
| `from` / `to` | move command 의 시작/목적지 Pointer. RFC 6902 op 로 내려가면 `from` / `path` 가 된다. |
| `path` | RFC 6902 op 의 대상 필드명. low-level ops 에서 사용한다. |

## Errors

| 용어 | 의미 |
|------|------|
| `JSONCrudError` | strict/apply path 에서 throw 되는 boundary error. |
| `invalid_pointer` | Pointer 형식 또는 array index 해석 실패. |
| `path_not_found` | replace/remove/test 대상 또는 필요한 parent 가 없음. |
| `move_into_self` | move 목적지가 from 의 자손인 경우. |
| `schema_violation` | Zod schema 검증 실패. |
| `test_failed` | RFC 6902 test op 비교 실패. |

**Version**: 2026-05-12
