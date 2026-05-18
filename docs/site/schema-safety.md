# Safety

1. schema를 깨는 변경은 commit하지 않습니다.
2. 실패한 변경은 문서 값, selection, history를 어중간하게 바꾸지 않습니다.

## Zod schema가 안전 경계입니다

schema는 문서가 가져야 할 모양입니다.

```ts
const Counter = z.object({
  count: z.number().min(0).max(100),
});
```

이 schema라면 `count`는 0 이상 100 이하의 숫자여야 합니다.

```ts
doc.ops.replace("/count", 10);  // 성공
doc.ops.replace("/count", 999); // 실패
```

실패하면 `doc.value.count`는 이전 값 그대로입니다.

## 실패는 결과로 확인합니다

편집 작업은 `JSONResult`를 반환합니다.

```ts
const result = doc.ops.replace("/count", 999);

if (!result.ok) {
  console.log(result.code);
}
```

자주 만나는 실패 코드는 다음과 같습니다.

| 코드 | 뜻 |
|------|----|
| `schema_violation` | Zod schema를 위반했습니다 |
| `path_not_found` | 바꾸려는 위치가 없습니다 |
| `invalid_pointer` | 위치 문자열이 잘못됐습니다 |
| `test_failed` | `test` 작업이 실패했습니다 |
| `move_into_self` | 자기 자신의 자식으로 이동하려 했습니다 |

## strict와 onError

`strict: false` 이면 실패를 throw 없이 화면에 보여주기 쉽습니다.

```ts
const doc = useJSONDocument(Schema, initial, {
  strict: false,
  onError(error) {
    console.log(error.result.code);
  },
});
```

| 옵션 | 설명 |
|------|------|
| `strict: true` | 실패 시 `JSONCrudError`를 throw합니다 |
| `strict: false` | throw하지 않고 `JSONResult`로 알려줍니다 |
| `onError` | 실패했을 때 항상 호출됩니다 |

## 예제: 잘못된 값 거절하기

::source{path="apps/site/src/examples/RejectedDrift.tsx" title="RejectedDrift.tsx" lines="1-50"}

> 잘못된 값은 들어오려는 순간 거절되고, 기존 문서 값은 유지됩니다.

## 여러 작업도 안전합니다

`patch`는 여러 작업을 묶습니다.

```ts
doc.ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/title", value: "next" },
]);
```

첫 작업이 실패하면 뒤 작업은 적용되지 않습니다. 그래서 “버전이 맞을 때만 저장” 같은 흐름을 만들 수 있습니다.

## JSON이라서 안전한 점

`doc.value`는 JSON으로 직렬화할 수 있는 값입니다.

```ts
const text = JSON.stringify(doc.value);
```

localStorage, 서버 전송, Worker 메시지, SSR hydration 같은 곳에 넘기기 쉽습니다.

더 명시적인 helper가 필요하면 `serialize`, `parse`, `safeParse`를 씁니다.

::source{path="packages/zod-crud/src/core/pointer/serialize.ts" title="serialize helpers" lines="1-29"}
