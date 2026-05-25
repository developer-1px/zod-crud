# zod-crud Docs

zod-crud는 Zod schema로 보호되는 headless JSON 편집 엔진입니다. 앱은 `zod-crud` 또는 `zod-crud/react`만 import하고, 내부는 document facade, 편집 규칙, JSON 표준 primitive로 나뉩니다.

```txt
document
├─ patch(patch)
├─ duplicate(pointer, options)
├─ at(pointer)
├─ query(jsonPath)
├─ selection
├─ clipboard
├─ history
└─ can*
```

## 배경

프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일입니다. 폼, CMS block, kanban card, outliner, API collection은 UI는 달라도 결국 값 추가, 변경, 이동, 복제, 선택, 붙여넣기, 되돌리기를 다룹니다.

문제는 이 규칙을 앱마다 다시 만들 때 생깁니다. patch 형식, pointer 주소, multi-selection, clipboard payload, undo stack, schema validation이 서로 다른 레이어에 흩어지면 같은 편집 동작을 테스트하기 어렵고, UI 코드가 상태 변경 규칙까지 떠안게 됩니다.

zod-crud는 UI component가 아닙니다. JSON 편집의 공통 규칙을 headless document facade로 고정하고, 제품 UI는 그 위에서 버튼, 단축키, drag, focus, rendering만 결정하게 합니다.

## Core concept

핵심은 표준 이름과 제품 이름을 섞지 않는 것입니다.

| 개념 | 맡는 일 |
| --- | --- |
| JSON value | 편집 대상 state |
| Zod schema | state와 payload 검증 |
| JSON Pointer | 정확한 주소 |
| JSONPath | 여러 위치 검색 |
| JSON Patch | 변경 기록과 실행 형식 |
| Selection | 무엇이 선택됐는지 나타내는 JSON-safe 상태 |
| Clipboard | copy/cut/paste payload 흐름 |
| History | patch와 inverse patch 기반 undo/redo |
| `can*` | 실행 전 가능 여부와 실패 이유 |

따라서 흐름은 아래처럼 유지합니다.

```txt
검색: JSONPath -> Pointer[]
변경: Pointer -> JSON Patch
검증: payload -> Zod schema
상태: selection / clipboard / history -> JSON-safe snapshot
```

## 소스 구조

현재 source layout의 기준은 public entrypoint와 내부 단방향 레이어입니다.

```txt
src/
├─ index.ts
│  └─ public root entrypoint: zod-crud
├─ react.ts
│  └─ public React entrypoint: zod-crud/react
├─ application/
│  └─ document/
│     ├─ create.ts
│     ├─ types.ts
│     ├─ read.ts
│     ├─ schema.ts
│     ├─ runtime/
│     │  └─ types.ts
│     ├─ can/
│     │  ├─ check.ts
│     │  ├─ result.ts
│     │  └─ types.ts
│     ├─ state/
│     │  ├─ json.ts
│     │  ├─ patch.ts
│     │  ├─ commit.ts
│     │  └─ change.ts
│     ├─ history/
│     │  ├─ undoRedo.ts
│     │  ├─ transaction.ts
│     │  ├─ metadata.ts
│     │  ├─ restore.ts
│     │  └─ types.ts
│     ├─ clipboard/
│     │  ├─ clipboard.ts
│     │  └─ types.ts
│     └─ selection/
│        ├─ action.ts
│        └─ create.ts
├─ domain/
│  ├─ copy.ts
│  ├─ cut.ts
│  ├─ paste.ts
│  ├─ duplicate.ts
│  ├─ pointer/
│  │  ├─ array.ts
│  │  └─ track.ts
│  ├─ schema/
│  │  ├─ array/
│  │  ├─ object/
│  │  ├─ validation/
│  │  ├─ shared/
│  │  ├─ introspection.ts
│  │  ├─ patch.ts
│  │  ├─ rekey.ts
│  │  └─ zod.ts
│  └─ selection/
│     ├─ autoRules.ts
│     ├─ order.ts
│     ├─ point.ts
│     ├─ read.ts
│     ├─ reducer.ts
│     ├─ snap.ts
│     ├─ spans.ts
│     ├─ textDelete.ts
│     ├─ textEdit.ts
│     ├─ traversal.ts
│     └─ types.ts
└─ foundation/
   ├─ error.ts
   ├─ history.ts
   ├─ json/
   ├─ jsonpath/
   ├─ patch/
   │  └─ fast/
   └─ pointer/
```

의존 방향은 아래처럼 읽습니다.

```txt
src/index.ts, src/react.ts
└─ application/document
   ├─ domain
   │  └─ foundation
   └─ foundation
```

`application/document`는 public document 표면을 조립합니다. `domain`은 copy, cut, paste, duplicate, schema validation, selection 같은 순수 편집 규칙입니다. `foundation`은 JSON Patch, JSON Pointer, JSONPath, JSON clone/equal, history entry, error 같은 표준 primitive입니다.

앱은 `zod-crud`와 `zod-crud/react`만 import합니다. `application`, `domain`, `foundation`은 package subpath가 아닙니다. 소스 경로를 말할 때는 공개 진입점을 `src/index.ts`, `src/react.ts`로 씁니다.

## Public API 경계

High-level mutation인 `doc.duplicate(...)`, `doc.clipboard.cut(...)`, `doc.clipboard.paste(...)`, `doc.clipboard.pastePayload(...)`는 성공하면 document에 즉시 적용됩니다. 성공 결과의 `applied`는 이미 applied patch 기록이므로 다시 `commit`하지 않습니다.

`doc.commit(...)`과 `doc.canPatch(...)`는 operation arrays를 받습니다. 반복 편집은 가능하면 배열 하나로 묶습니다. `history.transaction`은 history entry를 묶지만 반복 `doc.patch(...)` 호출을 한 번의 schema validation pass로 바꾸지는 않습니다.

`doc.at(pointer)`와 `doc.query(jsonPath)`는 raw value가 아니라 `ReadResult` 같은 결과 객체를 반환합니다. JSONPath는 변경 언어가 아닙니다. `doc.query(...)`로 Pointer를 찾은 뒤 그 Pointer로 patch를 만듭니다.

## 성능 경계

Public `applyPatch`는 외부 JSON boundary입니다. 입력 state 전체가 JSON-safe인지 확인한 뒤 patch를 적용합니다.

Document 내부 state는 trusted document state입니다. schema가 plain structural Zod schema이고 edit가 independent non-root `replace`, array edit, same-array `add`/`remove` batch에 해당하면 document path는 더 좁은 검증 경로를 씁니다. refinement, transform, check가 있는 schema는 full root schema validation으로 돌아갑니다.

```sh
npm run perf:core
```

## 이걸로 할 수 있는 것들

- CMS block editor: block 추가, 이동, 복제, schema-safe paste.
- Kanban/card editor: card 검색, multi-select, duplicate, list 간 paste.
- Outliner/tree editor: indent/outdent를 JSON Pointer와 `move` patch로 번역.
- API collection editor: request/response JSON 검색, batch replace, clipboard flow.
- Settings editor: schema validation, reasoned `can*` 결과, undo/redo.

## 다음에 볼 문서

- 작은 카드 편집기를 처음부터 따라 만들려면 Tutorial을 봅니다.
- 이미 모델을 이해했고 메서드가 필요하면 API reference를 봅니다.
- release 전 문서 계약은 `npm run docs:evaluate`와 `npm run release:check`로 확인합니다.
