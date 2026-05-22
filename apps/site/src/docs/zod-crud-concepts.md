# zod-crud Docs

zod-crud는 Zod schema로 보호되는 JSON 편집 엔진입니다. 중심 API는 JSON 표준과 FE 편집 도구에서 이미 쓰이는 이름을 분리해서 씁니다.

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

핵심은 역할을 섞지 않는 것입니다.

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

## 이걸로 할 수 있는 것들

- CMS block editor: block 추가, 이동, 복제, schema-safe paste.
- Kanban/card editor: card 검색, multi-select, duplicate, list 간 paste.
- Outliner/tree editor: indent/outdent를 JSON Pointer와 `move` patch로 번역.
- API collection editor: request/response JSON 검색, batch replace, clipboard flow.
- Settings editor: schema validation, reasoned `can*` 결과, undo/redo.

## 다음에 볼 문서

- 작은 카드 편집기를 처음부터 따라 만들려면 Tutorial을 봅니다.
- 이미 모델을 이해했고 메서드가 필요하면 API reference를 봅니다.
