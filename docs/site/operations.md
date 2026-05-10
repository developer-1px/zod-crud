# 작업 모델

## RFC 6902 6 op

::source{path="packages/zod-crud/src/core/patch.ts" title="applyOperation" lines="1-317"}

### `add`

```ts
{ op: "add", path: "/title", value: "x" }       // object key 추가
{ op: "add", path: "/tasks/0", value: t }        // array 위치 0 에 삽입 (뒤를 밀어냄)
{ op: "add", path: "/tasks/-", value: t }        // array 끝에 append
{ op: "add", path: "", value: x }                // root 교체
```

### `remove`

```ts
{ op: "remove", path: "/draft" }                 // object key 삭제
{ op: "remove", path: "/tasks/2" }               // array 인덱스 삭제 + shift
```

### `replace`

```ts
{ op: "replace", path: "/title", value: "x" }    // 기존 값 교체. 대상 존재 필수
```

`add` 와 `replace` 의 차이: `add` 는 새 키 생성도 허용, `replace` 는 기존 키만 교체. SPEC §3.2.

### `move`

```ts
{ op: "move", from: "/inbox/1", path: "/done/-" }
{ op: "move", from: "/users/alice", path: "/users/alicia" }   // record key rename
```

`move` 는 `from` 제거 후 `path` 에 add 한 효과와 같습니다 (RFC 6902 §4.4). `path` 가 `from` 의 자손이면 `move_into_self` 에러.

### `copy`

```ts
{ op: "copy", from: "/template", path: "/instances/-" }
```

deep clone 후 add. from 과 path 의 값은 독립된 두 노드.

### `test`

```ts
{ op: "test", path: "/version", value: 1 }
```

deep-equal 검사. 실패 시 batch 전체 롤백.

## Batch — `patch(operations)`

::source{path="packages/zod-crud/src/core/patch.ts" title="applyPatch" lines="1-317"}

여러 op 를 atomic 하게 적용합니다. 한 op 가 실패하면 state 는 변경 0 (SPEC G8). Schema 검증은 batch 끝에서 1회.

```ts
ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/version", value: 2 },
  { op: "add", path: "/log/-", value: { ts: 0, who: "u" } },
]);
```

## Hook 표면

::source{path="packages/zod-crud/src/useJson.ts" title="useJson" lines="1-188"}

`ops.add/remove/replace/move/copy/test` 는 단일 op, `ops.patch` 는 batch. 모두 `JsonResult` 반환.

## History — opt-in

```ts
useJson(Schema, init, { history: 50 })
```

내부 형식은 `JsonPatchOperation[]` 스택 (forward + inverse). 표준 형식 그대로라 외부 직렬화 무료.

## Lifecycle

| 메서드 | 의미 |
|--------|------|
| `ops.load(value)` | schema 검증 후 state 교체. history clear |
| `ops.reset(value?)` | initial 또는 인자로 교체. history clear |
| `ops.undo()` / `ops.redo()` | history 스택 적용. opt-in 시에만 동작 |
