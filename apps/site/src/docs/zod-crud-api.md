# zod-crud API

zod-crud는 Zod schema로 보호되는 JSON 편집 엔진입니다. 앱 코드는 문서를 직접 고치기보다 “무엇을 하려는지”를 intent로 넘기고, zod-crud가 selection, schema, history, clipboard까지 맞춰 처리합니다.

## 먼저 잡아야 할 모델

- Schema는 계약입니다. 모든 변경은 Zod schema를 통과해야 합니다.
- Pointer는 주소입니다. `/lists/0/cards/1/title`처럼 문서 안의 위치를 가리킵니다.
- Intent는 사용자 의도입니다. `replace`, `move`, `copy`, `paste`, `undo` 같은 행동을 한 표면으로 실행합니다.
- Patch는 escape hatch입니다. 이미 JSON Patch operation을 알고 있을 때만 직접 씁니다.
- Selection은 현재 작업 대상입니다. intent에서 source나 target을 생략하면 selection이 기본값이 됩니다.

## 시작 방식

React 밖에서는 `createJSONDocument`를 씁니다.

```ts
import { z } from "zod";
import { createJSONDocument } from "zod-crud";

const Card = z.object({
  id: z.string(),
  title: z.string().min(1),
});

const doc = createJSONDocument(Card, { id: "c1", title: "Draft" }, {
  history: 100,
  selection: true,
});
```

React component에서는 `useJSONDocument`를 씁니다. 반환되는 `doc` 표면은 headless document와 같습니다.

```tsx
import { useJSONDocument } from "zod-crud/react";

function Editor() {
  const doc = useJSONDocument(Card, { id: "c1", title: "Draft" });

  return (
    <button onClick={() => doc.run({ type: "replace", path: "/title", value: "Ready" })}>
      Replace title
    </button>
  );
}
```

## 한 줄 선택지

- 읽기만 하면 `doc.read`
- 실행 전 확인이면 `doc.plan`
- 사용자 액션 실행이면 `doc.run`
- raw JSON Patch면 `doc.patch`
- selection 상태를 직접 바꾸면 `doc.selection`
- clipboard buffer를 직접 다루면 `doc.clipboard`
- undo/redo 상태를 보면 `doc.history`
- schema 정보를 보면 `doc.schema`

## 읽기: doc.read

`doc.read`는 문서를 바꾸지 않습니다. 화면 렌더, inspector, query result를 만들 때 씁니다.

```ts
doc.read.at("/title");
doc.read.exists("/lists/0/cards/0");
doc.read.query("$..cards[?(@.status=='todo')]");
doc.read.entries("/lists/0/cards");
```

기존 `doc.at`, `doc.exists`, `doc.query`, `doc.entries`도 같은 동작의 alias로 남아 있습니다. 새 코드에서는 `doc.read.*`를 우선 사용합니다.

## 실행 전 확인: doc.plan

`doc.plan(intent)`는 실제 문서를 바꾸지 않고, 같은 intent가 실행 가능한지 확인합니다. 실패하면 실패 이유를 돌려줍니다.

```ts
const plan = doc.plan({
  type: "replace",
  path: "/title",
  value: "",
});

if (!plan.ok) {
  console.log(plan.code, plan.reason);
}
```

clipboard paste처럼 payload를 생략하면 현재 clipboard buffer를 기준으로 검사합니다.

```ts
doc.plan({ type: "paste", target: "/lists/0/cards/-" });
```

boolean만 필요하면 `doc.plan(intent).ok`를 쓰면 됩니다. 기존 `doc.check`와 `doc.can`은 호환 표면으로 남아 있지만, 새 코드의 기본 설명 축은 `plan`입니다.

## 사용자 액션 실행: doc.run

`doc.run(intent)`은 사용자 의도를 실행합니다. selection-aware command와 clipboard action이 여기로 모입니다.

```ts
doc.run({ type: "replace", path: "/title", value: "Ready" });
doc.run({ type: "duplicate", source: "/lists/0/cards/0" });
doc.run({ type: "move", source: "/lists/0/cards/0", target: "/lists/1/cards/0" });
doc.run({ type: "remove", source: "/lists/0/cards/0" });
doc.run({ type: "undo" });
```

source나 target을 생략하면 현재 selection을 사용합니다.

```ts
doc.selection?.collapse("/lists/0/cards/0");
doc.run({ type: "copy" });
doc.run({ type: "paste", target: "/lists/1/cards/0", mode: "after" });
```

payload를 직접 넘기면 clipboard buffer를 거치지 않고 paste intent를 실행합니다.

```ts
doc.run({
  type: "paste",
  payload: { id: "new", title: "Inserted card" },
  target: "/lists/0/cards/-",
});
```

## Raw patch: doc.patch

이미 JSON Patch operation을 알고 있으면 `doc.patch`를 씁니다. 이 표면은 낮은 수준 escape hatch입니다.

```ts
doc.patch([
  { op: "replace", path: "/settings/owner", value: "playground" },
  { op: "replace", path: "/lists/0/name", value: "Backlog" },
], { label: "rename board" });
```

단일 patch helper가 필요하면 pure function도 사용할 수 있습니다.

```ts
import { applyPatch } from "zod-crud";

const result = applyPatch(BoardSchema, board, [
  { op: "replace", path: "/title", value: "Ready" },
]);
```

## Selection

selection은 현재 작업 대상입니다. multi-select, caret, range 선택을 같은 snapshot으로 다룹니다.

```ts
doc.selection?.collapse("/lists/0/cards/0");
doc.selection?.togglePointer("/lists/0/cards/1");
doc.selection?.setBaseAndExtent("/lists/0/cards/0", "/lists/0/cards/2");
doc.selection?.snapshot();
```

사용자 액션을 실행할 때는 selection을 직접 읽어 source를 넘기지 않아도 됩니다.

```ts
doc.selection?.collapse("/lists/0/cards/0");
doc.run({ type: "remove" });
```

## Clipboard buffer

copy, cut, paste라는 사용자 액션은 `doc.run`이 담당합니다. `doc.clipboard`는 buffer를 직접 읽거나 쓰고 싶을 때 씁니다.

```ts
doc.run({ type: "copy", source: "/lists/0/cards/0" });
doc.clipboard.read();
doc.clipboard.clear();

doc.clipboard.write({ id: "manual", title: "Manual card" });
doc.run({ type: "paste", target: "/lists/0/cards/-" });
```

## Schema

`doc.schema`는 pointer 위치의 schema 정보를 읽습니다. insert menu, inspector, form builder에서 유용합니다.

```ts
doc.schema.kind("/lists/0/cards/-", "insert");
doc.schema.describe("/lists/0/cards/-", "insert");
doc.schema.accepts("/lists/0/cards/-", candidateCard, "insert");
```

## Public exports

```ts
import {
  JSONCrudError,
  createJSONDocument,
  createSelection,
  createClipboard,
  applyOperation,
  applyPatch,
  parsePointer,
  tryParsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
  parentPointer,
  lastSegment,
  lastSegmentIndex,
  appendSegment,
  withLastSegment,
  trackPointer,
  type JSONDocument,
  type JSONDocumentIntent,
  type JSONDocumentPlanResult,
  type JSONDocumentRead,
  type JSONDocumentRunResult,
  type JSONOps,
  type SelectionState,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type JSONPoint,
  type SelectionAction,
  type SelectionRange,
  type SelectionSnap,
} from "zod-crud";
```

React hook은 별도 entrypoint입니다.

```ts
import { useJSONDocument } from "zod-crud/react";
```

## 호환 표면

기존 `doc.ops`, `doc.commands`, `doc.check`, `doc.can`은 유지됩니다. 다만 새 문서와 데모는 더 작은 중심 API인 `read`, `plan`, `run`, `patch`를 먼저 보여줍니다.

- `doc.commands.*`는 대부분 `doc.run(intent)`로 표현됩니다.
- `doc.check.*`와 `doc.can.*`은 대부분 `doc.plan(intent)`로 표현됩니다.
- `doc.ops.patch`는 `doc.patch`로 표현됩니다.
- `doc.ops.add/remove/replace/move/copy/test/load/reset`은 low-level 호환 표면입니다.
