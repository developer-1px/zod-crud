# zod-crud 문서

zod-crud는 Zod schema를 기준으로 JSON 데이터를 안전하게 읽고 바꾸는 headless 편집 도구입니다. UI component는 제공하지 않습니다. 앱은 버튼, 단축키, focus, rendering을 만들고, zod-crud는 변경 가능 여부, patch 적용, selection, clipboard, history를 맡습니다.

```txt
앱에서 하려는 일
|-- schema로 데이터 모양을 정한다
|-- document를 만든다
|-- Pointer로 바꿀 위치를 가리킨다
|-- can*으로 실행 가능 여부를 확인한다
|-- patch / commit / duplicate / paste로 변경한다
`-- Result, selection, history를 UI에 반영한다
```

## 배경

프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일입니다. Form, CMS block, kanban card, outliner는 UI는 달라도 결국 값 추가, 변경, 이동, 복제, 선택, 붙여넣기, 되돌리기를 다룹니다.

문제는 이 규칙을 앱마다 다시 만들 때 생깁니다. Patch 형식, pointer 주소, multi-selection, clipboard payload, undo stack, schema validation이 서로 다른 코드에 흩어지면 같은 편집 동작을 테스트하기 어렵고, UI 코드가 상태 변경 규칙까지 떠안게 됩니다.

zod-crud는 이 공통 규칙을 document API로 고정합니다. 처음 쓰는 사람은 내부 폴더를 몰라도 됩니다. 필요한 것은 schema, data, path, change, result입니다.

## 핵심 개념

먼저 알아야 하는 개념은 사용 순서대로 아래와 같습니다.

| 개념 | 알아야 하는 것 |
| --- | --- |
| Zod schema | document가 허용하는 데이터 구조입니다. |
| JSON value | 실제 편집 대상 state입니다. |
| JSON Pointer | 한 위치를 정확히 가리키는 주소입니다. 예: `/lists/0/cards/0/title` |
| JSONPath | 여러 위치를 검색하는 언어입니다. 검색 결과는 Pointer 목록입니다. |
| JSON Patch | 값을 추가, 교체, 제거, 이동하는 변경 형식입니다. |
| `can*` | 실행 전에 가능한 작업인지 확인하고 실패 이유를 받습니다. |
| Result | 읽기, 검색, 변경, 붙여넣기 실패를 결과 객체로 확인합니다. |
| Selection | 현재 선택된 Pointer 상태입니다. |
| Clipboard | copy/cut/paste payload 흐름입니다. |
| History | patch와 inverse patch로 undo/redo를 제공합니다. |

가장 중요한 규칙은 검색과 변경을 섞지 않는 것입니다.

```txt
검색: JSONPath -> Pointer[]
변경: Pointer -> JSON Patch
검증: payload -> Zod schema
상태: selection / clipboard / history -> JSON-safe snapshot
```

## 기본 사용 흐름

```ts
import { z } from "zod";
import { createJSONDocument } from "zod-crud";

const Card = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]),
});

const doc = createJSONDocument(Card, {
  id: "c1",
  title: "Write docs",
  status: "todo",
}, {
  history: 100,
  selection: true,
});

const patch = [{ op: "replace", path: "/status", value: "doing" }] as const;

if (doc.canPatch(patch).ok) {
  doc.commit(patch, { label: "change status" });
}
```

React에서는 같은 document 표면을 hook으로 받습니다.

```tsx
import { useJSONDocument } from "zod-crud/react";

const doc = useJSONDocument(Card, initialCard, {
  history: 100,
  selection: true,
});
```

## 자주 쓰는 작업

| 하고 싶은 일 | 먼저 보는 API |
| --- | --- |
| 현재 값 읽기 | `doc.value`, `doc.at(pointer)` |
| 하위 항목 나열 | `doc.entries(pointer)` |
| 여러 위치 찾기 | `doc.query(jsonPath)` |
| 값 추가, 변경, 삭제 | `doc.patch(...)`, `doc.commit([...])` |
| 실행 전 검증 | `doc.canPatch(...)`, `doc.canPastePayload(...)`, `doc.canFind(...)` |
| sibling 복제 | `doc.duplicate(pointer, options)` |
| 선택 상태 저장 | `doc.selection?.selectRanges(...)`, `doc.selection?.snapshot()` |
| 복사/잘라내기/붙여넣기 | `doc.clipboard.copy(...)`, `doc.clipboard.cut(...)`, `doc.clipboard.paste(...)` |
| 되돌리기/다시하기 | `doc.canUndo()`, `doc.history.undo()`, `doc.history.redo()` |

High-level mutation인 `doc.duplicate(...)`, `doc.clipboard.cut(...)`, `doc.clipboard.paste(...)`, `doc.clipboard.pastePayload(...)`는 성공하면 document에 즉시 적용됩니다. 성공 결과의 `applied`는 이미 applied patch 기록이므로 다시 `commit`하지 않습니다.

`doc.at(pointer)`와 `doc.query(jsonPath)`는 raw value가 아니라 `ReadResult`와 `QueryResult` 같은 결과 객체를 반환합니다.

## 실패 처리

`can*`는 boolean이 아니라 이유가 있는 결과입니다.

```ts
const candidate = { id: "c2", title: "", status: "todo" };
const result = doc.canPastePayload("/cards/-", candidate);

if (!result.ok) {
  result.code;
  result.reason;
  result.violations;
}
```

이 구조 때문에 버튼 활성화, validation message, command palette의 disabled reason을 같은 값으로 만들 수 있습니다.

`violations[].path`는 JSON Pointer입니다. `doc.schema.accepts(...)`는 요청한 schema 위치 기준의 `schema-slot` path를, `doc.canPatch(...)`와 `doc.canPastePayload(...)`는 patch preview 후 document 결과 위치 기준의 `document-result` path를 돌려줍니다.

`strict`는 `doc.patch`, `doc.commit`, `doc.load`, `doc.reset` 실행 실패 정책입니다. `can*`는 항상 Result를 반환하고, document execution method는 strict mode에서 `JSONCrudError`를 throw할 수 있습니다.

## 성능 경계

대부분의 앱은 `doc.patch`, `doc.commit`, `doc.canPatch`만 쓰면 됩니다. 공개 `applyPatch`는 외부 JSON 경계입니다. 입력 state 전체가 JSON-safe인지 확인한 뒤 patch를 적용합니다.

Document 내부 state는 신뢰된 document state입니다. schema가 구조만 가진 Zod schema이고 edit가 independent non-root `replace`, array edit, same-array `add`/`remove` batch에 해당하면 document path는 더 좁은 검증 경로를 씁니다. Refinement, transform, check가 있는 schema는 전체 루트 schema 검증으로 돌아갑니다.

```sh
npm run perf:core
```

## 이걸로 할 수 있는 것들

- CMS block editor: block 추가, 이동, 복제, schema-safe paste.
- Kanban/card editor: card 검색, multi-select, duplicate, list 간 paste.
- Outliner/tree editor: indent/outdent를 JSON Pointer와 JSON Patch로 번역.
- Settings editor: schema validation, reasoned `can*` 결과, undo/redo.

## 다음에 볼 문서

- 작은 카드 편집기를 처음부터 따라 만들려면 tutorial을 봅니다.
- 이미 모델을 이해했고 method가 필요하면 API reference를 봅니다.
- release 전 문서 계약은 `npm run docs:evaluate`와 `npm run release:check`로 확인합니다.

## 관리자 메모

아래 내용은 API 사용에 필요하지 않습니다. release 확인 시 문서 계약만 확인합니다.

Package API는 `zod-crud`와 `zod-crud/react`입니다. 앱은 이 두 entrypoint만 import합니다. 전체 public export 목록은 `packages/zod-crud/public-contract.json`이 기준입니다.
