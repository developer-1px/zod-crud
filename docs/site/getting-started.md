# 시작하기

## 설치

```sh
npm install zod-crud zod
```

`zod` 는 peer dependency, `react >=18` 은 `useJson` 사용 시에만 필요한 optional peer dependency 입니다. 패키지는 ESM 전용입니다.

## 첫 번째 편집

::source{path="apps/site/src/examples/snippet-getting-started.ts" title="first patch"}

`applyPatch` 는 `(state, ops) → { state, result }` 의 순수함수입니다. React 와 무관하게 어디서나 import 할 수 있고, 동일 입력은 동일 출력을 보장합니다 (SPEC G6).

## React 에서 — `useJson`

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx"}

훅이 반환하는 `[json, ops]` 의 `ops` 는 RFC 6902 6 op 와 1:1 대응하는 메서드 객체입니다. `set` `insert` `delete` `rename` `paste` 같은 편의 alias 는 SPEC §3.3 에 의해 금지됩니다 — 표준 6 op 의 조합으로 모든 mutation 을 표현합니다.

## 표준 op 빠른 참조

| 동작 | RFC 6902 |
|------|----------|
| 키 갱신 | `replace("/title", v)` |
| 새 키 추가 | `add("/draft", v)` |
| 끝에 append | `add("/tasks/-", v)` |
| 인덱스에 insert | `add("/tasks/0", v)` |
| 제거 | `remove("/tasks/2")` |
| 재배치 | `move("/tasks/2", "/tasks/0")` |
| 복제 | `copy("/tasks/2", "/tasks/-")` |
| 사전 검증 | `test("/version", 1)` |
| record key rename | `move("/users/old", "/users/new")` |

## 다음 단계

[핵심 개념](/docs/concepts) 에서 SPEC §0.1 의 5대 원칙이 코드에서 어떻게 강제되는지 봅니다.
