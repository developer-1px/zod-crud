# 스키마 안전성

zod-crud의 안전성은 “변경 후에 Zod가 다시 검사한다”는 단순한 규칙에서 나옵니다.

## 성공한 state만 commit됩니다

operation을 적용하면 먼저 새 state 후보를 만듭니다. 그 다음 schema를 검사합니다. 통과하면 commit, 실패하면 기존 state를 유지합니다.

::source{path="packages/zod-crud/src/core/patch.ts" title="schema validation" lines="280-329"}

이 보장은 React hook에서도 같습니다.

```ts
const result = ops.replace("/score", 999);

if (!result.ok) {
  // state는 바뀌지 않았습니다.
}
```

## 실패는 `JsonResult`로 드러납니다

실패 결과는 `{ ok: false, code, reason?, pointer? }` 모양입니다.

::source{path="packages/zod-crud/src/core/patch.ts" title="JsonResult" lines="1-28"}

대표적인 code는 다음과 같습니다.

| code | 의미 |
|------|------|
| `invalid_pointer` | Pointer 문법이 틀림 |
| `path_not_found` | 대상 위치가 없음 |
| `move_into_self` | 자기 자식으로 이동하려 함 |
| `schema_violation` | 변경 결과가 Zod schema를 위반 |
| `test_failed` | `test` operation 실패 |
| `not_serializable` | JSON으로 직렬화할 수 없는 값 |

## strict 모드

React hook에서는 실패를 어떻게 드러낼지 고를 수 있습니다.

```ts
const [json, ops] = useJson(Schema, initial, {
  strict: false,
  onError(error) {
    console.error(error.result.code);
  },
});
```

| 옵션 | 설명 |
|------|------|
| `strict: true` | 실패 시 `JsonCrudError`를 throw |
| `strict: false` | throw하지 않고 `JsonResult` 반환 |
| `onError` | 실패 시 호출되는 콜백 |

개발 환경에서는 기본적으로 strict가 켜지고, production에서는 꺼집니다.

## 예제: schema drift 거절하기

::source{path="apps/site/src/examples/RejectedDrift.tsx" title="RejectedDrift.tsx" lines="1-50"}

이 예제는 잘못된 값이 들어왔을 때 state가 조용히 깨지지 않고, 실패 결과로 드러나는 흐름을 보여줍니다.

## Batch atomicity

`patch`는 여러 작업을 하나의 transaction처럼 다룹니다.

```ts
ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/version", value: 2 },
  { op: "replace", path: "/title", value: "Saved" },
]);
```

첫 번째 `test`가 실패하면 `version`도, `title`도 바뀌지 않습니다.

## 직렬화 보증

state는 JSON입니다. 별도 class instance나 Map, Date를 넣는 모델이 아닙니다.

::source{path="packages/zod-crud/src/core/serialize.ts" title="serialize helpers" lines="1-29"}

그래서 저장과 복원이 단순합니다.

```ts
const text = serialize(json);
const restored = parse(Schema, text);
```
