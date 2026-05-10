# zod-crud 소개

`zod-crud`는 **Zod schema 로 보호되는 JSON tree 라이브러리**입니다. state·action·change 모두 100% JSON 직렬화 가능, 모든 변경은 **RFC 6902 JSON Patch** 의 6 op, 모든 path 는 **RFC 6901 JSON Pointer**. 코어는 순수함수이고 React 의존은 `useJson` 훅 하나로 격리됩니다.

## 30년 호환 헌장 (SPEC §0.1)

다음 5개 원칙은 라이브러리 정체성이며 절대 변경되지 않습니다.

1. **JSON-only state** — state·action·change 가 100% JSON. function·Symbol·Date·Map·Set·class instance 0개
2. **RFC 6901 단일 path 정본** — dotted, bracket, array shorthand 같은 편의 형식 0개
3. **RFC 6902 단일 operation 정본** — `add` `remove` `replace` `move` `copy` `test` 외 추가 0개
4. **Pure core** — 모든 mutation 은 `(state, op) → { state, result }` 순수함수
5. **React 의존 = hook 1개** — 코어는 React 없이 어디서나 import 가능

## 5초 코드

```ts
const [json, ops] = useJson(Schema, initial);
ops.replace("/title", "next");
ops.add("/tasks/-", task);
ops.move("/tasks/2", "/tasks/0");
ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/version", value: 2 },
]);
```

## Public surface (SPEC §5)

::source{path="packages/zod-crud/src/index.ts" title="public exports"}

## 무엇이 아닌가 (SPEC §8)

UI 컴포넌트, 폼 라이브러리, JSON Schema 렌더러, persistence layer, selection model, focus management, drag-and-drop, CRDT 모두 비-목표입니다. 사용자가 직접 가져옵니다.

## 다음 단계

[시작하기](/docs/getting-started) → [핵심 개념](/docs/concepts) → [작업 모델](/docs/operations).
