# zod-crud

zod-crud는 Zod schema가 있는 JSON 문서를 편집하기 위한 headless document
engine입니다.

UI component, admin CRUD framework, app state manager가 아닙니다. zod-crud는
편집 툴들이 공유하는 schema-safe document layer를 제공합니다: JSON Pointer
주소, JSON Patch 변경, JSONPath 검색, schema validation, selection, clipboard
payload, undo/redo history, reasoned `can*` checks.

공식 사이트와 데모: https://developer-1px.github.io/zod-crud/

## 왜 zod-crud인가

폼, CMS block, kanban board, outliner, settings editor는 UI가 달라도 같은 일을 합니다. schema가 있는 JSON document를 읽고, 바꾸고, 선택하고, 복사하고, 붙여넣고, 되돌립니다.

zod-crud는 이 공통 규칙을 UI component 밖으로 빼서 하나의 document engine으로 제공합니다.

```txt
schema -> document -> pointer/query -> can* -> change -> result
```

처음 쓰는 사람은 내부 폴더를 몰라도 됩니다. 필요한 것은 schema, JSON value, Pointer, change, Result입니다.

## 설치

```sh
npm install zod-crud zod
```

`zod`는 peer dependency입니다. React를 쓰는 앱만 `zod-crud/react`를 import합니다.

## 시작 예제

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

## 작업별 진입점

| 하고 싶은 일 | 공개 API |
| --- | --- |
| headless document 만들기 | `createJSONDocument(schema, initial, options?)` |
| React에서 같은 표면 쓰기 | `useJSONDocument(schema, initial, options?)` |
| 현재 값 읽기 | `doc.value`, `doc.lastPatch` |
| 한 위치 읽기 | `doc.at(pointer)` |
| 하위 항목 나열 | `doc.entries(pointer)` |
| 여러 위치 찾기 | `doc.find(jsonPath)`, `doc.query(jsonPath)` |
| 값 삽입, 교체, 삭제, 이동 | `doc.insert(...)`, `doc.replace(...)`, `doc.delete(...)`, `doc.move(...)` |
| 실행 전 확인 | `doc.canPatch`, `doc.canFind`, `doc.canInsert`, `doc.canReplace`, `doc.canDelete`, `doc.canMove`, `doc.canDuplicate`, `doc.canCopy`, `doc.canCut`, `doc.canPaste`, `doc.canUndo`, `doc.canRedo` |
| sibling 복제 | `doc.duplicate(pointer?, options)` |
| 선택 상태 저장 | `doc.selection` |
| copy, cut, paste, 직접 payload paste | `doc.copy(...)`, `doc.cut(...)`, `doc.paste(...)`, `doc.paste(target, { payload })` |
| undo, redo | `doc.undo()`, `doc.redo()`, `doc.history` |
| 위치별 schema 확인 | `doc.schema.at`, `doc.schema.kind`, `doc.schema.describe`, `doc.schema.accepts` |

## 핵심 규칙

- Patch path와 selection/clipboard target은 JSON Pointer입니다.
- JSONPath는 값을 찾는 언어이며 직접 변경하지 않습니다.
- `doc.at(pointer)`는 raw value가 아니라 `ReadResult`를 반환합니다.
- `can*`는 boolean이 아니라 이유 있는 capability result입니다.
- `doc.duplicate`, `doc.cut`, `doc.paste`는 성공하면 즉시 적용됩니다. 성공 결과의 `applied`는 다시 `commit`하지 않습니다.
- Pointer 배열을 copy/cut하면 clipboard payload도 배열입니다.
- Tree semantics는 app-owned입니다. zod-crud는 JSON을 검증하고 mutate합니다.

## React — `useJSONDocument`

```tsx
import { z } from "zod";
import { useJSONDocument } from "zod-crud/react";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

export function App() {
  const doc = useJSONDocument(Schema, { title: "", tasks: [] }, { history: 50 });

  return (
    <>
      <input
        value={doc.value.title}
        onChange={(event) =>
          doc.patch({ op: "replace", path: "/title", value: event.target.value })
        }
      />
      <button
        onClick={() =>
          doc.insert("/tasks/-", { id: "task-1", done: false })
        }
      >
        insert task
      </button>
      <button onClick={() => doc.undo()} disabled={!doc.canUndo().ok}>
        undo
      </button>
    </>
  );
}
```

## 클립보드

Core clipboard는 `navigator.clipboard`가 아니라 headless JSON payload buffer입니다. Browser system clipboard는 `@zod-crud/clipboard-web` extension에서 조립합니다.

```ts
const copied = doc.copy(["/lists/0/cards/0"]);

if (copied.ok) {
  doc.paste("/lists/1/cards/-");
}
```

삽입 위치를 이미 알고 있으면 `/items/-`나 `/lists/1/cards/-` 같은 Pointer를 그대로 넘깁니다. 기존 값을 기준으로 붙일 때는 `{ before: pointer }`, `{ after: pointer }`, `{ replace: pointer }`를 사용합니다.

## Official extensions

공식 extension은 core에 plugin 등록하지 않고 public `JSONDocument` surface를 함수로 조립합니다.

```ts
import { createCollection } from "@zod-crud/collection";
import { createOutline } from "@zod-crud/outline";
import { createSchemaForm } from "@zod-crud/schema-form";
import { createFormDraft } from "@zod-crud/form-draft";
import { createProtectedRanges } from "@zod-crud/protected-ranges";
import { createDirtyState } from "@zod-crud/dirty-state";
import { createBulkEdit } from "@zod-crud/bulk-edit";
import { createPatchLog } from "@zod-crud/patch-log";
import { createDocumentPersistence } from "@zod-crud/persist-web";
import { createIdResolver } from "@zod-crud/id-resolver";
import { createPatchPreview } from "@zod-crud/patch-preview";
import { createSearchReplace } from "@zod-crud/search-replace";
import { createProposedChanges } from "@zod-crud/proposed-changes";
import { createComments } from "@zod-crud/comments";
import { createWebClipboard } from "@zod-crud/clipboard-web";
```

공식 package는 현재 `packages/*`에 있는 extension만 뜻합니다. `labs/extensions/*`는 후보이며 public API로 약속하지 않습니다.

## 순수 core

Root helper는 React-free이며 외부 JSON 경계에서 유용합니다.

```ts
import * as z from "zod";
import { applyPatch } from "zod-crud";

const Schema = z.object({ title: z.string(), tags: z.array(z.string()) });
const initial = { title: "draft", tags: [] };

const r = applyPatch(Schema, initial, [
  { op: "add", path: "/tags/-", value: "docs" },
  { op: "replace", path: "/title", value: "final" },
]);
```

## 직렬화

State, operation, selection snapshot, patch record는 JSON입니다.

```ts
import * as z from "zod";

const Schema = z.object({ title: z.string() });
const state = { title: "draft" };

const json = JSON.stringify(state);
const restored = Schema.parse(JSON.parse(json));
const safe = Schema.safeParse(JSON.parse(json));
```

Operation은 `application/json-patch+json`으로 보낼 수 있습니다.

```ts
const operations = [{ op: "replace", path: "/title", value: "final" }];
const body = JSON.stringify(operations);

body satisfies string;
```
