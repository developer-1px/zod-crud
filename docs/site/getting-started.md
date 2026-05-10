# Quick Start

이 페이지에서는 가장 작은 JSON 편집기를 만듭니다. 목표는 `useJsonDocument`가 어떤 느낌인지 먼저 잡는 것입니다.

## 설치

```sh
npm install zod-crud zod
```

React에서 hook을 쓸 것이므로 앱에는 `react >=18`도 필요합니다.

## 1. 문서 모양을 Zod schema로 선언합니다

편집기는 아무 값이나 받으면 안 됩니다. 먼저 “이 문서는 어떤 모양이어야 하는가”를 정합니다.

```ts
import { z } from "zod";

const Todo = z.object({
  title: z.string().min(1),
  done: z.boolean(),
});
```

여기서는 문서가 `title`과 `done`을 가진 JSON 객체입니다. `title`은 빈 문자열이면 안 되고, `done`은 boolean이어야 합니다.

## 2. `useJsonDocument`로 문서를 엽니다

```tsx
import { useJsonDocument } from "zod-crud";

const doc = useJsonDocument(Todo, {
  title: "write docs",
  done: false,
});
```

이제 `doc`가 편집기 상태입니다.

| 필드 | 지금 단계에서의 의미 |
|------|----------------------|
| `doc.value` | 현재 문서 |
| `doc.ops` | 문서를 바꾸는 함수 묶음 |
| `doc.history` | undo/redo |

## 3. 화면에 값을 보여줍니다

```tsx
<input
  value={doc.value.title}
  onChange={(event) => {
    doc.ops.replace("/title", event.target.value);
  }}
/>
```

`"/title"`은 문서 안에서 `title` 위치를 가리키는 주소입니다. 지금은 “앞에 `/`를 붙인 key 이름” 정도로 이해해도 됩니다.

## 4. 실패는 state를 바꾸지 않습니다

schema는 `title`이 빈 문자열이면 안 된다고 말합니다. 그래서 아래 변경은 실패합니다.

```ts
const result = doc.ops.replace("/title", "");
```

결과는 `JsonResult`입니다.

| 경우 | 의미 |
|------|------|
| `{ ok: true }` | 변경 성공 |
| `{ ok: false, code: "schema_violation" }` | schema 위반으로 실패 |

실패하면 `doc.value`는 이전 값 그대로입니다. 이게 zod-crud의 가장 중요한 안전성입니다.

## 5. undo/redo를 켭니다

history는 옵션으로 켭니다.

```tsx
const doc = useJsonDocument(Todo, initial, {
  history: 50,
});
```

```tsx
<button onClick={doc.history.undo} disabled={!doc.history.canUndo}>
  undo
</button>
<button onClick={doc.history.redo} disabled={!doc.history.canRedo}>
  redo
</button>
```

`history: 50`은 최근 50개 변경을 되돌릴 수 있게 하겠다는 뜻입니다.

## 전체 예제

이 예제는 낮은 레벨 `useJson`을 보여주지만, 입력과 schema-safe commit의 기본 흐름은 같습니다. 다음 페이지부터는 `useJsonDocument`를 중심으로 봅니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}

## 다음에 읽을 것

[useJsonDocument](/docs/concepts)에서 `doc.value`, `doc.ops`, `doc.history`, `doc.selection`, `doc.focus`를 하나씩 설명합니다.
