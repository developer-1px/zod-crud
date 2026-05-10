# 시작하기

## 설치

```sh
npm install zod-crud zod
```

`zod`는 peer dependency입니다. React hook을 사용할 때만 `react >=18`이 필요합니다. 패키지는 ESM 전용입니다.

## 1단계: schema를 먼저 정합니다

zod-crud는 “아무 JSON이나” 편집하지 않습니다. 먼저 Zod schema로 문서의 모양을 정합니다.

```ts
import * as z from "zod";

const TodoSchema = z.object({
  title: z.string(),
  tasks: z.array(
    z.object({
      id: z.string(),
      done: z.boolean(),
    }),
  ),
});
```

이 schema는 계약입니다. 작업을 적용한 뒤 결과가 이 계약을 깨면 state는 바뀌지 않습니다.

## 2단계: React 없이 먼저 이해하기

`applyPatch`는 순수함수입니다. 같은 schema, 같은 state, 같은 operations를 넣으면 항상 같은 결과가 나옵니다.

::source{path="apps/site/src/examples/snippet-getting-started.ts" title="first patch" lines="1-28"}

반환값은 `{ state, result, applied }`입니다.

| 필드 | 의미 |
|------|------|
| `state` | 성공하면 새 state, 실패하면 기존 state |
| `result` | `{ ok: true }` 또는 실패 코드 |
| `applied` | 실제 commit된 RFC 6902 operation 목록 |

실패하면 `applied`는 빈 배열입니다. 그래서 selection/focus 같은 좌표 모델도 실패한 변경에는 반응하지 않습니다.

## 3단계: React에서 사용하기

React에서는 `useJson`을 씁니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}

`useJson`은 `[json, ops]`를 반환합니다.

- `json`은 schema를 통과한 plain JSON state입니다.
- `ops`는 JSON Patch 작업을 함수로 묶은 객체입니다.

`setTitle`, `insertTask`, `deleteTask` 같은 전용 함수가 따로 있지 않습니다. 표준 작업 6개를 그대로 씁니다.

## 빠른 작업 표

| 하고 싶은 일 | 쓰는 작업 |
|--------------|-----------|
| 기존 값 바꾸기 | `ops.replace("/title", value)` |
| object key 추가 | `ops.add("/draft", value)` |
| 배열 끝에 추가 | `ops.add("/tasks/-", task)` |
| 배열 중간에 삽입 | `ops.add("/tasks/0", task)` |
| 제거 | `ops.remove("/tasks/2")` |
| 이동 | `ops.move("/tasks/2", "/tasks/0")` |
| 복제 | `ops.copy("/tasks/2", "/tasks/-")` |
| 조건 확인 | `ops.test("/version", 1)` |
| 여러 작업 atomic 적용 | `ops.patch([...])` |

## 다음 단계

[작업 모델](/docs/operations)에서 6개 operation을 하나씩 봅니다. [선택과 포커스](/docs/clipboard-history)에서는 editor 좌표가 변경을 따라가는 방식을 배웁니다.
