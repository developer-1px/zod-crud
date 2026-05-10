# 고급 사용

기본 사용법을 익혔다면, 이 페이지에서 타입 추론, 외부 patch, 순수 코어, 구독 API를 살펴봅니다.

## `UseJsonOptions`

::source{path="packages/zod-crud/src/useJson.ts" title="UseJsonOptions" lines="14-19"}

| 옵션 | 기본 | 설명 |
|------|------|------|
| `history` | `0` | undo/redo 스택 크기. `0`이면 비활성 |
| `strict` | dev=`true`, prod=`false` | 실패 시 throw 여부 |
| `onError` | 없음 | 실패 시 호출되는 콜백 |

처음 배울 때는 `history`만 기억해도 충분합니다.

```ts
const [json, ops] = useJson(Schema, initial, { history: 100 });
```

## 타입으로 Pointer와 value를 맞춥니다

`JsonOps<T>`는 `PointerOf<T>`와 `ValueAt<T, P>`를 사용합니다. 그래서 가능한 경우 TypeScript가 path와 value 타입을 같이 확인합니다.

::source{path="packages/zod-crud/src/core/path-types.ts" title="PointerOf / ValueAt" lines="1-44"}

예를 들어 `title`이 string이면 다음처럼 잡힙니다.

```ts
ops.replace("/title", "ok");
ops.replace("/title", 42);       // TypeScript error
ops.replace("/unknown", "no");   // TypeScript error
```

복잡한 동적 path를 만들 때는 TypeScript가 모든 문자열을 증명하지 못할 수 있습니다. 그때도 런타임에서는 Pointer parse, path resolve, schema validation이 다시 검사합니다.

## 외부 patch 적용

서버나 다른 클라이언트에서 받은 JSON Patch도 그대로 적용할 수 있습니다.

```ts
const patch: JsonPatchOperation[] = await response.json();
const result = ops.patch(patch);
```

표준 RFC 6902 형식이므로 다른 언어의 JSON Patch 라이브러리와도 맞출 수 있습니다.

## 순수 코어 직접 사용

React 바깥에서는 `applyOperation`과 `applyPatch`를 씁니다.

::source{path="packages/zod-crud/src/core/patch.ts" title="pure core" lines="274-329"}

예를 들어 서버에서 클라이언트 patch를 검증할 수 있습니다.

```ts
const r = applyPatch(Schema, currentState, clientPatch);

if (!r.result.ok) {
  return new Response(r.result.code, { status: 400 });
}

await save(r.state);
```

## 구독 API

`ops.subscribe`는 commit된 operation 목록을 알려줍니다. `useSelection`과 `useFocus`가 이 API를 사용합니다.

```ts
const unsubscribe = ops.subscribe((applied) => {
  console.log(applied);
});
```

실패한 patch는 commit되지 않으므로 listener가 호출되지 않습니다.

`ops.state`는 listener나 focus recovery에서 현재 state를 읽기 위한 snapshot입니다.

## Pointer tracking helper

selection/focus hook 없이 직접 좌표를 따라가고 싶다면 `trackPointer` 또는 `trackPointers`를 씁니다.

::source{path="packages/zod-crud/src/core/track.ts" title="track helpers" lines="131-135"}

```ts
const next = trackPointer("/items/3", [
  { op: "remove", path: "/items/1" },
]);
// "/items/2"
```

삭제된 위치나 그 자식은 `null`이 됩니다.

## SPEC을 먼저 봅니다

동작이 헷갈리면 [`packages/zod-crud/SPEC.md`](https://github.com/developer-1px/zod-crud/blob/main/packages/zod-crud/SPEC.md)가 기준입니다. 코드, 문서, 테스트가 충돌하면 SPEC이 이깁니다.
