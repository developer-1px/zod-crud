# zod-crud 소개

`zod-crud`는 JSON 문서를 안전하게 고치는 작은 도구입니다. 핵심 생각은 단순합니다.

1. 데이터는 그냥 JSON 객체입니다.
2. 위치는 RFC 6901 JSON Pointer 문자열로 가리킵니다.
3. 변경은 RFC 6902 JSON Patch 6개 작업으로 표현합니다.
4. Zod schema가 변경 후 상태를 검사합니다.
5. React에서는 `useJson`으로 상태와 작업 함수를 받습니다.

처음에는 “JSON 객체를 직접 `setState` 하면 되지 않나?”라고 생각할 수 있습니다. 작은 예제에서는 맞습니다. 하지만 문서 편집기, 트리 편집기, 리스트 편집기처럼 변경을 기록하고, 되돌리고, 서버와 주고받고, 선택된 항목의 위치까지 따라가야 하면 규칙이 필요합니다. zod-crud는 그 규칙을 표준 위에 얇게 올립니다.

## 두 개의 축

zod-crud는 기능을 두 축으로 나눕니다.

| 축 | 맡는 일 |
|----|---------|
| Axis 1 | JSON 데이터 자체를 안전하게 바꾸는 일 |
| Axis 2 | editor에서 쓰는 selection/focus 좌표를 따라가게 하는 일 |

Axis 1은 React 없이도 동작합니다. 서버, 테스트, Worker에서도 `applyPatch`를 바로 쓸 수 있습니다.

Axis 2는 React hook입니다. `useSelection`과 `useFocus`가 `useJson`의 변경 알림을 구독해서, 배열 삽입·삭제·이동이 일어나도 선택과 포커스 위치를 자동으로 갱신합니다.

## 가장 작은 예

```ts
const [json, ops] = useJson(Schema, initial);

ops.replace("/title", "New title");
ops.add("/tasks/-", { id: "1", done: false });
ops.move("/tasks/2", "/tasks/0");
```

여기서 `"/title"`과 `"/tasks/2"`는 모두 JSON Pointer입니다. `replace`, `add`, `move`는 모두 JSON Patch 표준 작업입니다.

## Public surface

현재 public export는 이 파일이 기준입니다.

::source{path="packages/zod-crud/src/index.ts" title="public exports" lines="1-35"}

## 무엇을 하지 않나요?

zod-crud는 UI 컴포넌트가 아닙니다. 버튼, input, tree row, keyboard shortcut, drag-and-drop 이벤트는 직접 만듭니다.

대신 라이브러리는 UI 아래쪽의 안정적인 모델을 제공합니다.

- JSON state 검증
- JSON Pointer path
- JSON Patch operation
- undo/redo history
- selection/focus 좌표 추적

## 다음 단계

[시작하기](/docs/getting-started)에서 첫 patch를 적용해 보고, [핵심 개념](/docs/concepts)에서 Pointer와 Patch를 천천히 익힙니다.
