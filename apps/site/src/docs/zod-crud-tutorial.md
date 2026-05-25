# 튜토리얼: 작은 카드 편집기 만들기

작은 board state를 만들고, 추가, 변경, 검색, 선택, 붙여넣기, 검증, undo를 한 번씩 연결합니다. 앱 코드는 public entrypoint만 import합니다.

```txt
app
└─ zod-crud / zod-crud/react
   └─ application/document
      ├─ domain
      │  └─ foundation
      └─ foundation
```

내부 `application`, `domain`, `foundation` 폴더는 동작을 이해하기 위한 구조입니다. 사용 코드는 `src/index.ts`가 내보내는 `zod-crud`와 `src/react.ts`가 내보내는 `zod-crud/react`에만 의존합니다.

## 1. schema와 document 만들기

먼저 앱의 JSON state를 Zod schema로 정합니다. 이 예제는 list 안에 card가 들어 있는 작은 board입니다.

```ts
import { z } from "zod";
import { createJSONDocument } from "zod-crud";

const Card = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]),
});

const Board = z.object({
  lists: z.array(z.object({
    id: z.string(),
    title: z.string(),
    cards: z.array(Card),
  })),
});

const doc = createJSONDocument(Board, {
  lists: [{
    id: "inbox",
    title: "Inbox",
    cards: [{ id: "c1", title: "Write docs", status: "todo" }],
  }],
}, {
  history: 100,
  selection: true,
});
```

`createJSONDocument`는 `application/document/create.ts`에서 document facade를 만들고, schema 검증과 JSON Patch 처리는 `domain`과 `foundation`에 위임합니다.

## 2. patch로 값 바꾸기

값을 바꿀 때는 JSON Patch를 적용합니다. `path`는 JSON Pointer입니다.

```ts
doc.patch({
  op: "add",
  path: "/lists/0/cards/-",
  value: { id: "c2", title: "Review API", status: "todo" },
});

doc.patch({
  op: "replace",
  path: "/lists/0/cards/0/status",
  value: "doing",
});
```

연속 변경을 하나의 document change로 묶어야 하면 `doc.commit([...], metadata)`를 씁니다.

```ts
doc.commit([
  { op: "replace", path: "/lists/0/cards/0/title", value: "Write final docs" },
  { op: "replace", path: "/lists/0/cards/0/status", value: "done" },
], { label: "finish card" });
```

`doc.commit(...)`과 `doc.canPatch(...)`는 operation arrays를 받습니다.

## 3. JSONPath로 찾고 Pointer로 바꾸기

여러 위치를 찾을 때는 JSONPath로 검색하고, 반환된 Pointer로 patch를 만듭니다.

```ts
const todos = doc.query("$..cards[?(@.status=='todo')]");

if (todos.ok) {
  doc.patch(todos.pointers.map((path) => ({
    op: "replace",
    path: `${path}/status`,
    value: "done",
  })));
}
```

검색: JSONPath -> Pointer[]

JSONPath는 변경 언어가 아닙니다. `doc.query(...)` 결과의 Pointer를 JSON Patch `path`로 사용합니다.

## 4. selection과 clipboard 연결하기

Selection은 무엇이 선택됐는지 보관하고, clipboard가 payload 흐름을 맡습니다.

```ts
doc.selection?.selectRanges(["/lists/0/cards/0"]);

const source = doc.selection?.selectedPointers ?? [];
doc.clipboard.copy(source);

doc.clipboard.paste("/lists/0/cards/-", {
  spread: true,
  rekey: { fields: ["id"], strategy: "suffix" },
});
```

`selectedPointers`는 JSON-safe selection snapshot에서 읽습니다. Pointer 배열을 copy하면 clipboard payload도 배열입니다. 한 항목만 복사해도 붙여넣을 때 sibling으로 펼치려면 `spread: true`를 넘깁니다.

이미 `/cards/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다. 기존 항목을 기준으로 붙일 때는 `{ after: "/lists/0/cards/0" }`처럼 씁니다.

## 5. 실행 전에 can* 확인하기

사용자 action을 실행하기 전에는 `can*`로 같은 조건을 미리 확인할 수 있습니다.

```ts
const candidate = { id: "c3", title: "", status: "todo" };
const canPaste = doc.canPastePayload("/lists/0/cards/-", candidate);

if (!canPaste.ok) {
  canPaste.code;
  canPaste.reason;
  canPaste.violations;
}
```

`canFind`는 JSONPath 검색 가능 여부를 확인합니다.

```ts
const canFindTodo = doc.canFind("$..cards[?(@.status=='todo')]");
```

## 6. history로 되돌리기

되돌리기는 document history에 둡니다.

```ts
if (doc.canUndo().ok) {
  doc.history.undo();
}
```

History entry에는 `mergeKey`, `mergeLast`, selection snapshot metadata를 붙일 수 있습니다.

```ts
doc.commit([
  { op: "replace", path: "/lists/0/cards/0/title", value: "Typing" },
], { label: "typing", mergeKey: "card-title", selection: doc.selection?.snapshot() });

doc.history.mergeLast({ mergeKey: "card-title" });
```

`history.transaction`은 history entry를 묶지만 반복 `doc.patch(...)` 호출을 한 번의 schema validation으로 바꾸지는 않습니다. 알고 있는 batch는 `doc.commit([...])`으로 한 번에 넘깁니다.

## 7. React에서 쓰기

React에서는 같은 document 표면을 hook으로 받습니다.

```tsx
import { useJSONDocument } from "zod-crud/react";

const doc = useJSONDocument(Board, initialBoard, {
  history: 100,
  selection: true,
});
```

React hook은 `src/react.ts`의 별도 entrypoint입니다. Root package는 React-free입니다.

## 8. 배포 전 확인

문서와 public contract drift는 release gate에서 같이 확인합니다.

```sh
npm run docs:evaluate
npm run release:check
```
