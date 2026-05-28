# 튜토리얼: 작은 카드 편집기 만들기

작은 board state를 만들고, 추가, 변경, 검색, 선택, 붙여넣기, 검증, undo를 한 번씩 연결합니다. 앱 코드는 `zod-crud` 또는 `zod-crud/react`만 import합니다.

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

여기서 알아야 할 것은 세 가지입니다. schema가 허용 구조이고, document가 현재 value와 변경 API를 들고 있으며, path는 JSON Pointer입니다.

## 2. 변경 전에 확인하기

사용자 action은 실행 전에 `can*`로 확인합니다.

```ts
const card = { id: "c2", title: "Review API", status: "todo" };

const canInsert = doc.canInsert("/lists/0/cards/-", card);

if (canInsert.ok) {
  doc.insert("/lists/0/cards/-", card);
}
```

실패하면 결과 객체에서 UI 메시지를 만들 수 있습니다.

```ts
const candidate = { id: "c3", title: "", status: "todo" };
const canPaste = doc.canPaste("/lists/0/cards/-", { payload: candidate });

if (!canPaste.ok) {
  canPaste.code;
  canPaste.reason;
  canPaste.violations;
}
```

## 3. patch로 값 바꾸기

값을 바꿀 때는 JSON Patch를 적용합니다. `path`는 JSON Pointer입니다.

```ts
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

## 4. JSONPath로 찾고 Pointer로 바꾸기

여러 위치를 찾을 때는 JSONPath로 검색하고, 반환된 Pointer로 patch를 만듭니다.

```ts
const todos = doc.find("$..cards[?(@.status=='todo')]");

if (todos.ok) {
  doc.patch(todos.pointers.map((path) => ({
    op: "replace",
    path: `${path}/status`,
    value: "done",
  })));
}
```

검색: JSONPath -> Pointer[]

JSONPath는 변경 언어가 아닙니다. `doc.find(...)` 결과의 Pointer를 JSON Patch `path`로 사용합니다.

## 5. selection과 clipboard 연결하기

Selection은 무엇이 선택됐는지 보관하고, clipboard가 payload 흐름을 맡습니다.

```ts
doc.selection?.selectRanges(["/lists/0/cards/0"]);

const source = doc.selection?.selectedPointers ?? [];
doc.copy(source);

doc.paste("/lists/0/cards/-", {
  spread: true,
  rekey: { fields: ["id"], strategy: "suffix" },
});
```

`selectedPointers`는 JSON-safe selection snapshot에서 읽습니다. Pointer 배열을 copy하면 clipboard payload도 배열입니다. 한 항목만 복사해도 붙여넣을 때 sibling으로 펼치려면 `spread: true`를 넘깁니다.

이미 `/cards/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다. 기존 항목을 기준으로 붙일 때는 `{ after: "/lists/0/cards/0" }`처럼 씁니다.

## 6. history로 되돌리기

되돌리기는 document history에 둡니다.

```ts
if (doc.canUndo().ok) {
  doc.undo();
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

Root package는 React-free입니다. React 앱에서만 `zod-crud/react`를 import합니다.

## 8. 배포 전 확인

문서와 public contract drift는 release gate에서 같이 확인합니다.

```sh
npm run docs:evaluate
npm run release:check
```
