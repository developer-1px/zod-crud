# Editor State

편집기는 단순히 값 하나만 들고 있지 않습니다. 사용자가 보고 있는 문서 값, 방금 한 편집, 선택된 항목, 포커스, 되돌리기 기록이 함께 움직입니다.

zod-crud는 이 묶음을 `doc` 객체로 다룹니다.

## 문서 값

문서 값은 `doc.value`입니다.

```ts
doc.value;
```

이 값은 항상 schema를 통과한 JSON입니다. 편집 실패가 발생하면 `doc.value`는 바뀌지 않습니다.

## 편집 작업

편집은 `doc.ops`로 합니다.

```ts
doc.ops.replace("/title", "New title");
doc.ops.add("/items/-", item);
doc.ops.remove("/items/0");
doc.ops.move("/items/2", "/items/0");
```

입문 단계에서는 operation 이름을 이렇게 이해하면 됩니다.

| 작업 | 언제 쓰나요? |
|------|--------------|
| `replace` | 이미 있는 값을 바꿀 때 |
| `add` | 새 값을 넣을 때 |
| `remove` | 값을 지울 때 |
| `move` | 위치를 옮길 때 |
| `copy` | 복제할 때 |
| `test` | 바꾸기 전에 값이 맞는지 확인할 때 |
| `patch` | 여러 작업을 한 번에 적용할 때 |

## 여러 작업을 한 번에 적용하기

가끔 편집 하나가 여러 단계로 이루어집니다. 예를 들어 버전을 확인하고 제목을 바꾸고 로그를 추가할 수 있습니다.

```ts
doc.ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/title", value: "Saved" },
  { op: "add", path: "/logs/-", value: "saved title" },
]);
```

중간에 하나라도 실패하면 전체가 취소됩니다. 이것을 atomic하다고 말합니다. 입문자 관점에서는 “반쯤만 바뀌는 일이 없다”고 이해하면 됩니다.

## 선택 상태

selection은 사용자가 선택한 JSON 위치들입니다.

```ts
doc.selection?.set(["/items/0", "/items/1"]);
doc.selection?.toggle("/items/2");
doc.selection?.clear();
```

선택 상태는 UI와 분리되어 있습니다. DOM node를 저장하지 않고 JSON 문서 안의 위치를 저장합니다.

## 포커스 상태

focus는 현재 키보드 조작의 기준이 되는 위치입니다.

```ts
doc.focus?.set("/items/0");
doc.focus?.clear();
```

트리나 아웃라이너에서는 “현재 커서가 있는 노드”라고 생각하면 됩니다.

## 변경을 따라가는 좌표

배열에서 `/items/0`을 삭제하면 원래 `/items/2`였던 항목은 `/items/1`이 됩니다. selection과 focus는 이런 변경을 자동으로 따라갑니다.

```ts
doc.focus?.set("/items/2");
doc.ops.remove("/items/0");
// focus는 /items/1 쪽으로 이동
```

이 동작 때문에 사용자는 매번 “삭제했으니 선택 index를 하나 줄여야 하나?” 같은 코드를 직접 쓰지 않아도 됩니다.

## 히스토리

history는 문서 편집을 되돌리고 다시 적용합니다.

```ts
doc.history.undo();
doc.history.redo();
```

버튼에는 `canUndo`, `canRedo`를 연결합니다.

```tsx
<button disabled={!doc.history.canUndo} onClick={doc.history.undo}>
  undo
</button>
```

## 핵심 요약

사용자에게 가까운 모델은 이것입니다.

```txt
doc
├─ value      현재 문서
├─ ops        문서를 바꾸는 방법
├─ history    되돌리기
├─ selection  선택된 위치들
└─ focus      현재 활성 위치
```

내부에서 이것이 JSON Pointer와 JSON Patch로 표현된다는 사실은 나중에 알아도 됩니다.
