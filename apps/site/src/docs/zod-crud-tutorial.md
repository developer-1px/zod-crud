# 튜토리얼: 작은 카드 편집기 만들기

작은 board state를 만들고, 추가, 변경, 검색, 선택, 붙여넣기, 검증, undo를 한 번씩 연결합니다.

## 1. schema와 document 만들기

먼저 domain state를 Zod schema로 정합니다. 이 예제는 list 안에 card가 들어 있는 작은 board입니다.

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

## 6. history로 되돌리기

되돌리기는 document history에 둡니다.

```ts
if (doc.canUndo().ok) {
  doc.history.undo();
}
```

## 7. React에서 쓰기

React에서는 같은 document 표면을 hook으로 받습니다.

```tsx
import { useJSONDocument } from "zod-crud/react";

const doc = useJSONDocument(Board, initialBoard, {
  history: 100,
  selection: true,
});
```
