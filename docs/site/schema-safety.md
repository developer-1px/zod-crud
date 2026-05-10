# 스키마 안전성

## G3 — schema valid

state 는 항상 `schema.safeParse(state).success === true` 를 만족합니다. 매 op 적용 직후 (또는 `patch` 의 경우 batch 종료 후 1회) Zod 가 검증하고, 실패하면 state 는 변경 0.

::source{path="packages/zod-crud/src/core/patch.ts" title="applyOperation / applyPatch" lines="1-317"}

## G8 — atomicity

`patch(operations)` 는 RFC 6902 §3 의 batch semantics 를 따릅니다. 한 op 가 실패하면 전체 롤백, 모두 성공한 경우에만 commit.

```ts
ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/version", value: 2 },
  { op: "replace", path: "/title", value: "next" },
]);
// version 이 1 이 아니면 title 도 갱신되지 않음.
```

## 실패가 시끄러워지는 모드

::source{path="apps/site/src/examples/RejectedDrift.tsx" title="rejected drift" lines="1-50"}

`strict: false` (prod 기본) 이면 `JsonResult` 가 반환되고, `strict: true` (dev 기본) 이면 `JsonCrudError` 가 throw 됩니다. 두 모드 모두 `onError` 콜백을 호출합니다.

## 직렬화 보증 (G1)

::source{path="packages/zod-crud/src/core/serialize.ts" title="serialize / parse / safeParse" lines="1-29"}

state 는 100% JSON 이므로 `JSON.parse(JSON.stringify(state))` 가 항상 round-trip 합니다. localStorage, SSR hydration, postMessage, Worker 어디서나 비용 0 으로 넘길 수 있습니다.

## 외부 patch 받기

RFC 6902 표준이라 다른 언어·라이브러리가 만든 patch 도 그대로 적용됩니다.

```ts
const patch: JsonPatchOperation[] = await fetchFromServer();
ops.patch(patch);
```

서버에서는 `fast-json-patch` (Node), `python-json-patch`, `json-patch` (Ruby) 등 어떤 RFC 6902 구현을 써도 호환됩니다.
