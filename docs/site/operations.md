# Editor State

`doc` 는 문서 값, 편집, selection, 캐럿, history 를 함께 들고 있는 객체입니다. `doc.ops` 는 JSON Patch 저수준 표면, `doc.commands` 는 제품 수준 명령 표면.
마지막으로 적용된 문서 patch 는 `doc.lastPatch` 로 읽습니다.

## 문서 값

문서 값은 `doc.value`입니다.

```ts
doc.value;
```

이 값은 항상 schema를 통과한 JSON입니다. 편집 실패가 발생하면 `doc.value`는 바뀌지 않습니다.

## 편집 작업

기본 편집은 `doc.ops`로 합니다.

```ts
doc.ops.replace("/title", "New title");
doc.ops.add("/items/-", item);
doc.ops.remove("/items/0");
doc.ops.move("/items/2", "/items/0");
doc.lastPatch;
```

| 작업 | 언제 쓰나요? |
|------|--------------|
| `replace` | 이미 있는 값을 바꿀 때 |
| `add` | 새 값을 넣을 때 |
| `remove` | 값을 지울 때 |
| `move` | 위치를 옮길 때 |
| `copy` | 복제할 때 |
| `test` | 바꾸기 전에 값이 맞는지 확인할 때 |
| `patch` | 여러 작업을 한 번에 적용할 때 |

## 명령 표면

공식 편집 어휘는 `doc.commands`에 모입니다.

```ts
doc.commands.find("$..title");
doc.commands.replace("$.items[*].done", true);
doc.commands.move("/items/2", "/items/0");
doc.commands.duplicate("/items/0");
doc.commands.cut("/items/1");
doc.commands.copy("/items/1");
doc.commands.paste(payload, "/items/-");
doc.commands.undo();
doc.commands.redo();
```

버튼을 만들 때는 `doc.can`으로 현재 state에서 가능한 작업인지 확인합니다. `find`는 JSONPath syntax를 확인하고, 실패 이유가 필요하면 같은 호출을 `doc.check`로 실행합니다.

```tsx
<button disabled={!doc.can.paste(payload, "/items/-")}>
  paste
</button>
```

```ts
doc.can.replace("$.items[*].done", true);
doc.check.find("$.items[");
```

selection cursor와 scope도 mutation 없이 확인할 수 있습니다.

```ts
doc.can.moveCursor("next", { points: visiblePoints });
doc.check.selectScope({ points: visiblePoints });
doc.can.selectScope({ query: "$.items[*].title" });
```

## 여러 작업을 한 번에 적용하기

가끔 편집 하나가 여러 단계로 이루어집니다. 예를 들어 버전을 확인하고 제목을 바꾸고 로그를 추가할 수 있습니다.

```ts
doc.ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/title", value: "Saved" },
  { op: "add", path: "/logs/-", value: "saved title" },
]);
```

중간에 하나라도 실패하면 전체가 취소됩니다 (atomic).

## 선택 상태

selection은 사용자가 선택한 JSON 위치들입니다.

```ts
doc.selection?.setBaseAndExtent("/items/0", "/items/1");
doc.selection?.togglePointer("/items/2");
doc.selection?.selectScope({ points: visiblePoints });
doc.selection?.selectScope({ query: "$.items[*].title" });
doc.selection?.empty();
```

선택 상태는 UI와 분리되어 있습니다. DOM node를 저장하지 않고 JSON 문서 안의 위치를 저장합니다.

## 캐럿 상태

캐럿은 collapsed selection입니다. 현재 키보드 조작의 기준이 되는 위치는 `selection.focus`입니다.

```ts
doc.selection?.collapse("/items/0");
doc.selection?.empty();
```

## 변경을 따라가는 좌표

배열에서 `/items/0`을 삭제하면 원래 `/items/2`였던 항목은 `/items/1`이 됩니다. selection의 range, anchor, focus는 이런 변경을 자동으로 따라갑니다.

```ts
doc.selection?.collapse("/items/2");
doc.ops.remove("/items/0");
// selection.focus는 /items/1 쪽으로 이동
```

## 히스토리

history는 문서 편집을 되돌리고 다시 적용합니다.

```ts
doc.commands.undo();
doc.commands.redo();
```

버튼에는 `canUndo`, `canRedo`를 연결합니다.

```tsx
<button disabled={!doc.history.canUndo} onClick={doc.commands.undo}>
  undo
</button>
```

`doc.ops.undo()`와 `doc.ops.redo()`도 같은 history stack을 사용합니다. `doc.history`는 상태와 `mergeLast()`, `transaction(fn)`을 제공하는 표면입니다.

patch와 최종 selection을 함께 아는 편집 엔진은 `doc.commit()`으로 한 history entry를 만듭니다.

```ts
doc.commit(
  [{ op: "replace", path: "/blocks", value: nextBlocks }],
  {
    label: "insertText",
    origin: "editor",
    selection: {
      type: "collapse",
      point: { path: "/blocks/0", offset: 2 },
      context: { marks: ["bold"] },
    },
  },
);
```

`selection.context`는 stored marks 같은 선택-local JSON 컨텍스트입니다.
selection-only commit처럼 빈 patch를 커밋하면 `doc.lastPatch`는 `[]`입니다.

```ts
doc.history.transaction(() => {
  doc.ops.replace("/title", "Saved");
  doc.ops.add("/logs/-", "saved title");
});
```

## 실전 시나리오

시나리오별 정본 코드(dict-record 한 키 쓰기, drag/burst undo, selection follow, clipboard, optimistic HTTP, headless)는 **[Patterns](/docs/patterns)** 페이지에 모았습니다. "이걸 만들고 싶다" 의 답은 거기서.

거부한 기능과 그 대안은 **[Why Not](/docs/why-not)** 페이지에.
