# Quick Start

## 설치

```sh
npm install zod-crud zod
```

React에서 hook을 쓸 것이므로 앱에는 `react >=18`도 필요합니다.

## 1. 문서 모양을 Zod schema로 선언합니다

```ts
import { z } from "zod";

const Todo = z.object({
  title: z.string().min(1),
  done: z.boolean(),
});
```

## 2. `useJSONDocument`로 문서를 엽니다

```tsx
import { useJSONDocument } from "zod-crud/react";

const doc = useJSONDocument(Todo, {
  title: "write docs",
  done: false,
});
```

이제 `doc`가 편집기 상태입니다.

| 필드 | 지금 단계에서의 의미 |
|------|----------------------|
| `doc.value` | 현재 문서 |
| `doc.ops` | JSON Pointer와 JSON Patch에 가까운 저수준 작업 |
| `doc.commands` | 편집기 기능으로 쓰기 좋은 명령 묶음 |
| `doc.history` | undo/redo 가능 여부 |

## 3. 화면에 값을 보여줍니다

```tsx
<input
  value={doc.value.title}
  onChange={(event) => {
    doc.ops.replace("/title", event.target.value);
  }}
/>
```

`"/title"`은 문서 안에서 `title` 위치를 가리키는 JSON Pointer 주소입니다.

## 4. 실패는 state를 바꾸지 않습니다

schema는 `title`이 빈 문자열이면 안 된다고 말합니다. 그래서 아래 변경은 실패합니다.

```ts
const result = doc.ops.replace("/title", "");
```

결과는 `JSONResult`입니다.

| 경우 | 의미 |
|------|------|
| `{ ok: true }` | 변경 성공 |
| `{ ok: false, code: "schema_violation" }` | schema 위반으로 실패 |

실패하면 `doc.value`는 이전 값 그대로입니다.

## 5. undo/redo를 켭니다

history는 옵션으로 켭니다.

```tsx
const doc = useJSONDocument(Todo, initial, {
  history: 50,
});
```

실제 undo/redo 실행은 `doc.ops.undo()` 또는 `doc.commands.undo()`로 합니다. `doc.history`는 버튼을 켜고 끄기 위한 상태 표면입니다.

```tsx
<button onClick={doc.commands.undo} disabled={!doc.history.canUndo}>
  undo
</button>
<button onClick={doc.commands.redo} disabled={!doc.history.canRedo}>
  redo
</button>
```

`history: 50`은 최근 50개 변경을 되돌릴 수 있게 하겠다는 뜻입니다.

## 전체 예제

이 예제는 낮은 레벨 `useJSON`을 보여주지만, 입력과 schema-safe commit의 기본 흐름은 같습니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}

## 다음에 읽을 것

[useJSONDocument](/docs/concepts)에서 `doc.value`, `doc.ops`, `doc.commands`, `doc.can`, `doc.history`, `doc.selection`을 하나씩 설명합니다.
