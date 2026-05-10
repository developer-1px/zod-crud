# 작업 모델

zod-crud에서 state를 바꾸는 방법은 JSON Patch 6개 operation뿐입니다. 이 페이지에서는 각 작업을 “언제 쓰는지” 중심으로 설명합니다.

## `add`: 새 값을 넣기

```ts
ops.add("/draft", true);
ops.add("/tasks/-", task);
ops.add("/tasks/0", task);
```

`add`는 object에서는 key를 만들거나 덮어씁니다. 배열에서는 지정한 위치에 삽입합니다. `"/tasks/-"`는 배열 끝에 추가하라는 뜻입니다.

```ts
{ op: "add", path: "/tasks/-", value: task }
```

## `remove`: 값 제거하기

```ts
ops.remove("/draft");
ops.remove("/tasks/2");
```

배열에서 제거하면 뒤의 인덱스가 앞으로 당겨집니다. 그래서 selection/focus 같은 Pointer도 같이 추적되어야 합니다.

## `replace`: 기존 값 교체하기

```ts
ops.replace("/title", "Next");
```

`replace`는 대상이 이미 있어야 합니다. 새 key를 만들고 싶다면 `add`를 씁니다.

이 차이를 기억하면 좋습니다.

| 작업 | 대상이 없어도 되나요? |
|------|----------------------|
| `add` | object key는 가능 |
| `replace` | 불가능 |

## `move`: 위치 옮기기

```ts
ops.move("/tasks/2", "/tasks/0");
ops.move("/users/alice", "/users/alicia");
```

`move`는 `from`에서 제거한 뒤 `path`에 추가한 효과입니다. record key rename도 `move`로 표현할 수 있습니다.

자기 자신의 자식으로 옮기는 것은 금지됩니다.

```ts
ops.move("/tasks/0", "/tasks/0/children/0"); // move_into_self
```

## `copy`: 복제하기

```ts
ops.copy("/templates/0", "/tasks/-");
```

`copy`는 값을 deep clone해서 새 위치에 추가합니다. 원본은 그대로 남습니다.

## `test`: 먼저 확인하기

```ts
ops.test("/version", 1);
```

단독으로도 쓸 수 있지만, 보통은 `patch` 안에서 조건부 업데이트를 만들 때 씁니다.

```ts
ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/version", value: 2 },
  { op: "replace", path: "/title", value: "Saved" },
]);
```

첫 번째 `test`가 실패하면 뒤의 `replace`는 하나도 적용되지 않습니다.

## `patch`: 여러 작업을 하나로 묶기

`patch`는 여러 operation을 순서대로 적용합니다. 중요한 규칙은 atomicity입니다.

> 하나라도 실패하면 전체가 실패하고 state는 그대로 남습니다.

::source{path="packages/zod-crud/src/core/patch.ts" title="applyPatch" lines="300-329"}

React hook에서는 이렇게 씁니다.

```ts
const result = ops.patch([
  { op: "add", path: "/tasks/-", value: task },
  { op: "replace", path: "/updatedAt", value: 0 },
]);
```

## `applied`는 왜 있나요?

`applyPatch`와 `applyOperation`은 성공한 작업 목록을 `applied`로 돌려줍니다. 실패하면 빈 배열입니다.

```ts
const r = applyPatch(Schema, state, operations);

if (r.result.ok) {
  r.applied; // commit된 operations
}
```

React의 `useJson`은 이 `applied`를 listener에게 알려줍니다. `useSelection`과 `useFocus`는 이 알림을 듣고 Pointer를 자동으로 갱신합니다.

## Hook 표면

::source{path="packages/zod-crud/src/useJson.ts" title="JsonOps" lines="24-46"}
