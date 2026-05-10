# 선택, 포커스, 히스토리

이 페이지는 editor를 만들 때 필요한 두 가지를 설명합니다.

- selection: 어떤 항목들이 선택되어 있는가
- focus: 키보드 기준으로 활성인 항목은 무엇인가

그리고 `useJson`의 undo/redo history도 함께 봅니다.

## 먼저 Pointer로 생각합니다

zod-crud에서 선택과 포커스는 DOM node가 아니라 JSON Pointer입니다.

```ts
selection.toggle("/tasks/2");
focus.set("/tasks/2");
```

이렇게 해두면 UI를 어떻게 그리든 같은 모델을 쓸 수 있습니다. list, tree, grid, treegrid 모두 “JSON 안의 위치”를 기준으로 연결됩니다.

## `useSelection`

::source{path="packages/zod-crud/src/useSelection.ts" title="useSelection types" lines="9-31"}

가장 단순한 사용법은 다음과 같습니다.

```ts
const [json, ops] = useJson(Schema, initial);
const selection = useSelection(ops, { mode: "multiple" });

selection.toggle("/tasks/0");
selection.has("/tasks/0");
selection.clear();
```

mode는 세 가지입니다.

| mode | 설명 |
|------|------|
| `single` | 하나만 선택합니다. 기본값입니다 |
| `multiple` | 여러 Pointer를 선택할 수 있습니다 |
| `extended` | anchor/focus를 사용한 range 선택에 맞춥니다 |

`range(anchor, focus)`는 같은 배열 부모 안에 있는 인덱스 범위를 펼칩니다. 예를 들어 `/tasks/1`부터 `/tasks/3`까지 선택하면 `/tasks/1`, `/tasks/2`, `/tasks/3`이 선택됩니다.

## `useFocus`

::source{path="packages/zod-crud/src/useFocus.ts" title="useFocus types" lines="9-20"}

focus는 하나만 존재합니다.

```ts
const focus = useFocus(ops);

focus.set("/tasks/2");
focus.clear();
```

`filter`를 주면 focus 가능한 Pointer를 제한할 수 있습니다.

```ts
const focus = useFocus(ops, {
  filter(state, pointer) {
    return pointer.startsWith("/tasks/");
  },
});
```

`recover`를 주면 포커스된 항목이 삭제됐을 때 다음 위치를 직접 정할 수 있습니다.

```ts
const focus = useFocus(ops, {
  recover(state, removed) {
    return state.tasks.length > 0 ? "/tasks/0" : null;
  },
});
```

## 자동 추적

selection과 focus의 가장 중요한 기능은 자동 추적입니다.

```ts
selection.set(["/tasks/2"]);
focus.set("/tasks/2");

ops.remove("/tasks/0");
```

`/tasks/0`이 제거되면 원래 `/tasks/2`였던 항목은 `/tasks/1`이 됩니다. `useSelection`과 `useFocus`는 `ops.subscribe`를 통해 commit된 operation을 듣고 Pointer를 갱신합니다.

::source{path="packages/zod-crud/src/core/track.ts" title="trackPointer" lines="1-25"}

low-level helper를 직접 쓸 수도 있습니다.

```ts
const next = trackPointer("/tasks/2", [
  { op: "remove", path: "/tasks/0" },
]);
// "/tasks/1"
```

## History

`useJson`의 history는 opt-in입니다.

```ts
const [json, ops] = useJson(Schema, initial, { history: 50 });
```

`history`를 생략하거나 `0`으로 두면 undo/redo 비용이 없습니다.

| API | 설명 |
|-----|------|
| `ops.undo()` | 이전 상태로 되돌립니다 |
| `ops.redo()` | 되돌린 작업을 다시 적용합니다 |
| `ops.canUndo()` | undo 가능 여부 |
| `ops.canRedo()` | redo 가능 여부 |

현재 구현은 되돌리기 단위를 root `replace` operation으로 저장합니다. 외부에서 보기에는 여전히 RFC 6902 operation입니다.

## Clipboard는 현재 public hook이 아닙니다

현재 public surface에는 `useClipboard`가 없습니다. 복제와 이동은 JSON Patch operation으로 직접 표현합니다.

| 하고 싶은 일 | 표현 |
|--------------|------|
| 복제 | `ops.copy("/tasks/2", "/tasks/-")` |
| 이동 | `ops.move("/tasks/2", "/tasks/0")` |
| 여러 작업으로 붙여넣기 | `ops.patch([...])` |

즉, clipboard UI는 애플리케이션이 만들고, 실제 데이터 변경은 RFC 6902 operation으로 보냅니다.
