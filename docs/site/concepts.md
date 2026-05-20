# useJSONDocument / createJSONDocument

`useJSONDocument`는 React에서 쓰는 중심 hook입니다. React 밖에서는 같은 표면의 `createJSONDocument`를 씁니다. 둘 다 낮은 레벨 작업들을 묶어 하나의 JSON 문서 편집 객체를 만듭니다.

## 반환값은 하나의 `doc` 객체입니다

```ts
const doc = useJSONDocument(Schema, initial);
```

`doc`는 편집 중인 JSON 문서 하나를 나타냅니다.

| 필드 | 설명 |
|------|------|
| `doc.value` | 현재 문서 값 |
| `doc.ops` | RFC 6902 6개 operation에 가까운 저수준 작업 API |
| `doc.commands` | select, find, move, duplicate, replace, cut, copy, paste, undo, redo 명령 |
| `doc.can` | 명령 실행 가능 여부를 계산하는 guard |
| `doc.history` | undo/redo 가능 여부, depth, history 병합 API |
| `doc.selection` | 선택 상태. 옵션을 켰을 때 사용 |

## `doc.value`

`doc.value`는 schema를 통과한 JSON 값입니다. 특별한 class가 아니라 평범한 객체입니다.

```tsx
<h1>{doc.value.title}</h1>
```

읽을 때는 그냥 React state처럼 읽으면 됩니다. 직접 수정하지 말고, 변경할 때는 `doc.ops`를 사용합니다.

## `doc.ops`

`doc.ops`는 JSON Patch에 가까운 저수준 작업입니다.

```ts
doc.ops.replace("/title", "New title");
doc.ops.add("/tasks/-", { text: "new task", done: false });
doc.ops.remove("/tasks/0");
```

`"/title"`, `"/tasks/0"` 은 문서 안의 위치를 가리키는 JSON Pointer 입니다.

## `doc.commands`와 `doc.can`

`doc.commands`는 공식 편집 어휘 10개를 제품 기능 이름으로 노출합니다.

```ts
doc.commands.find("$..title");
doc.commands.move("/tasks/2", "/tasks/0");
doc.commands.duplicate("/tasks/0");
doc.commands.cut("/tasks/1");
doc.commands.paste(payload, "/tasks/-");
doc.commands.undo();
```

`doc.can`은 같은 변경이 현재 state에서 가능한지 미리 확인합니다. 내부적으로 dry apply와 schema 검증을 거치므로 버튼 disabled 상태를 만들 때 씁니다. `find` 같은 읽기 command는 JSONPath syntax를 확인합니다. `doc.check`는 같은 답에 실패 코드와 이유를 붙여 돌려줍니다.

```tsx
<button disabled={!doc.can.move("/tasks/2", "/tasks/0")}>
  move up
</button>
```

```ts
doc.can.find("$.tasks[*].title");
doc.check.find("$.tasks["); // syntax_error
```

selection cursor도 같은 guard를 씁니다.

```tsx
<button disabled={!doc.can.moveCursor("next", { points: visiblePoints })}>
  next
</button>
```

`query`를 넘기면 find 결과를 바로 selection traversal로 씁니다.

```ts
doc.selection?.selectScope({ query: "$.tasks[?@.done == false]" });
doc.commands.moveCursor("first", { query: "$.tasks[*].title" });
```

## `doc.history`

history는 undo/redo 가능 여부와 history 병합을 제공합니다.

```tsx
const doc = useJSONDocument(Schema, initial, { history: 100 });

doc.history.canUndo;
doc.history.canRedo;
doc.history.undoDepth;
doc.history.redoDepth;
doc.history.mergeLast();
doc.history.transaction(() => {
  doc.ops.replace("/title", "A");
  doc.ops.add("/logs/-", "rename");
});
```

실행은 보통 `doc.commands.undo()` / `doc.commands.redo()`로 합니다. history를 켜지 않으면 undo/redo 스택은 쌓이지 않습니다.

## `doc.selection`

selection은 “선택된 위치들”입니다. 리스트나 트리 편집기에서 여러 항목을 선택할 때 씁니다.
W3C Selection API와 같은 모델이라서, 단일 캐럿도 별도 focus 객체가 아니라 collapsed
selection으로 표현합니다.

```ts
const doc = useJSONDocument(Schema, initial, {
  selection: { mode: "multiple" },
});

doc.selection?.toggleRange("/tasks/2");
doc.selection?.containsNode("/tasks/2");
```

selection은 Pointer 배열로 저장됩니다. 즉 선택된 DOM element가 아니라 선택된 JSON 위치를 기억합니다.

## 캐럿은 `doc.selection.focus`

현재 활성 위치는 `doc.selection.focus`입니다. 키보드 조작의 기준이 되는 항목을 표현할 때 씁니다.

```ts
const doc = useJSONDocument(Schema, initial, {
  selection: { mode: "multiple", initial: ["/tasks/0"] },
});

doc.selection?.collapse("/tasks/1");
doc.selection?.empty();
doc.selection?.moveCursor("next", { points: visiblePoints });
doc.selection?.selectScope({ query: "$.tasks[*].title" });
```

항목이 이동하거나 삭제되면 selection의 `anchor`와 `focus`는 변경을 따라갑니다.
`selection.isCollapsed`가 `true`이면 현재 selection은 단일 캐럿입니다.

## 옵션 전체

| 옵션 | 설명 |
|------|------|
| `history` | undo/redo 스택 크기 |
| `strict` | 실패 시 throw할지 여부 |
| `onError` | 실패했을 때 호출할 콜백 |
| `selection` | 선택 상태 노출 여부와 설정 |

## 언제 낮은 레벨 hook을 쓰나요?

낮은 레벨 hook은 이런 경우에 씁니다.

- selection을 완전히 다른 컴포넌트 경계에서 따로 관리하고 싶을 때
- document facade 없이 `useJSON`만 가볍게 쓰고 싶을 때

## 타입 표면

::source{path="packages/zod-crud/src/hooks/useJSONDocument.ts" title="useJSONDocument types" lines="21-49"}

React 없는 facade도 같은 표면 이름을 유지합니다.

::source{path="packages/zod-crud/src/createJSONDocument.ts" title="createJSONDocument types" lines="65-86"}
