# zod-crud Docs

zod-crud는 Zod schema로 보호되는 headless JSON 편집 엔진입니다. UI component가 아니라 앱의 JSON state를 안전하게 읽고 바꾸는 document facade입니다.

앱은 rendering, focus, button, shortcut, drag/drop, 제품별 command 이름을 소유합니다. zod-crud는 JSON Pointer 주소, JSON Patch 변경, JSONPath 검색, schema validation, selection, clipboard payload, undo/redo history를 소유합니다.

```txt
schema
`-- document
    |-- Pointer로 한 위치를 가리킴
    |-- JSONPath로 여러 위치를 찾음
    |-- can*으로 실행 가능 여부를 확인함
    |-- patch / commit / duplicate / clipboard로 변경함
    `-- Result, selection, history를 앱이 UI에 반영함
```

## 배경

프론트엔드 편집 기능은 대부분 JSON state를 바꾸는 일입니다. Form, CMS block, kanban card, outliner, settings editor는 UI는 달라도 삽입, 변경, 삭제, 이동, 복제, 선택, 복사, 붙여넣기, 되돌리기를 다룹니다.

이 규칙을 앱마다 다시 만들면 patch 형식, pointer 주소, multi-selection, clipboard payload, undo stack, schema validation이 UI 코드에 흩어집니다. zod-crud는 이 공통 규칙을 document API로 고정합니다.

## 핵심 개념

| 개념 | 뜻 |
| --- | --- |
| Zod schema | document가 허용하는 JSON 구조 |
| JSON value | 실제 편집 대상 state |
| JSON Pointer | 한 위치를 정확히 가리키는 주소. 예: `/lists/0/cards/0/title` |
| JSONPath | 여러 위치를 검색하는 언어. 결과는 Pointer 목록 |
| JSON Patch | 값을 추가, 교체, 제거, 이동하는 변경 형식 |
| `can*` | 실행 전에 가능한 작업인지 확인하고 실패 이유를 받는 probe |
| Result | 읽기, 검색, 변경, 붙여넣기의 성공/실패 객체 |
| Selection | 선택된 Pointer 상태 |
| Clipboard | copy/cut/paste payload 흐름 |
| History | patch와 inverse patch 기반 undo/redo |

가장 중요한 경계는 검색과 변경을 섞지 않는 것입니다.

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
| 여러 위치 찾기 | `doc.find(jsonPath)`, `doc.query(jsonPath)` |
| 값 삽입, 변경, 삭제 | `doc.insert(...)`, `doc.replace(...)`, `doc.delete(...)` |
| 실행 전 검증 | `doc.canInsert(...)`, `doc.canReplace(...)`, `doc.canDelete(...)` |
| sibling 복제 | `doc.duplicate(pointer, options)` |
| 선택 상태 저장 | `doc.selection?.selectRanges(...)`, `doc.selection?.snapshot()` |
| 복사/잘라내기/붙여넣기 | `doc.copy(...)`, `doc.cut(...)`, `doc.paste(...)` |
| 되돌리기/다시하기 | `doc.canUndo()`, `doc.undo()`, `doc.redo()` |

High-level mutation인 `insert`, `replace`, `delete`, `duplicate`, `cut`, `paste`는 성공하면 document에 즉시 적용됩니다. 성공 결과의 `applied`는 이미 적용된 patch 기록이므로 다시 `commit`하지 않습니다.

## 이걸로 할 수 있는 것들

- CMS block editor: block 추가, 이동, 복제, schema-safe paste.
- Kanban/card editor: card 검색, multi-select, duplicate, list 간 paste.
- Outliner/tree editor: indent/outdent를 JSON Pointer와 JSON Patch로 번역.
- Settings editor: schema validation, reasoned `can*` 결과, undo/redo.

## 다음 문서

- 작은 카드 편집기를 따라 만들려면 Quickstart를 봅니다.
- method와 option이 필요하면 API reference를 봅니다.
- 공식 extension을 조립하려면 Extensions를 봅니다.
