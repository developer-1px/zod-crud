# zod-crud API

zod-crud는 Zod schema로 보호되는 JSON 편집 엔진입니다. 중심 API는 JSON 표준과 FE 편집 도구에서 이미 쓰이는 이름을 분리해서 씁니다.

```txt
document
├─ patch(patch)
├─ duplicate(pointer, options)
├─ at(pointer)
├─ query(jsonPath)
├─ selection
├─ clipboard
├─ history
└─ can*
```

## 기준

- JSON Patch는 변경 형식입니다. 실행 진입점은 `doc.patch(...)`입니다.
- Duplicate는 JSON Patch `copy`보다 의도가 높은 sibling 복제입니다. 실행 진입점은 `doc.duplicate(...)`입니다.
- JSON Pointer는 정확한 주소입니다. patch, selection, clipboard target은 Pointer를 씁니다.
- JSONPath는 검색입니다. `doc.query(...)`는 여러 match를 찾고 Pointer 목록을 돌려줍니다.
- Selection은 선택 상태입니다. copy/cut/paste 자체를 소유하지 않습니다.
- Clipboard는 payload 흐름입니다. source와 target은 명시하는 쪽이 좋습니다.
- History는 patch 기록입니다. undo/redo는 `doc.history`에 둡니다.
- `can*`는 boolean이 아니라 이유가 있는 결과입니다.

## 시작

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

React에서는 같은 표면을 hook으로 받습니다.

```tsx
import { useJSONDocument } from "zod-crud/react";

function Editor() {
  const doc = useJSONDocument(Card, { id: "c1", title: "Draft" });

  return (
    <button onClick={() => doc.patch({ op: "replace", path: "/title", value: "Ready" })}>
      Replace
    </button>
  );
}
```

## document

`doc.value`는 현재 schema-valid JSON 값입니다.

```ts
doc.value;
doc.lastPatch;
doc.load(nextValue);
doc.reset();
doc.subscribe((patch, metadata) => {
  console.log(patch, metadata);
});
```

읽기는 document에 직접 둡니다.

```ts
doc.at("/title");
doc.exists("/lists/0/cards/0");
doc.query("$..cards[?(@.status=='todo')]");
doc.entries("/lists/0/cards");
```

## patch

`doc.patch`는 RFC 6902 JSON Patch를 적용합니다. 단일 operation과 operation 배열을 모두 받을 수 있습니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });

doc.patch([
  { op: "replace", path: "/settings/owner", value: "playground" },
  { op: "add", path: "/lists/0/cards/-", value: card },
]);
```

Patch의 `path`와 `from`은 JSON Pointer입니다. JSONPath를 patch에 직접 넣지 않습니다.

## duplicate

`doc.duplicate`는 sibling 복제를 표현합니다. 배열에서는 source 바로 뒤에 삽입하고, object member를 복제할 때는 `newKey`를 명시합니다.

```ts
const duplicated = doc.duplicate("/lists/0/cards/0", {
  rekey: { fields: ["id", "slug"], strategy: "suffix" },
});

if (duplicated.ok) {
  duplicated.value;
  duplicated.applied;
}
```

`doc.duplicate`는 즉시 적용됩니다. `applied`는 이미 적용된 patch 기록이므로 다시 `commit`하지 않습니다.
`rekey`는 복제 payload 안의 id-like field 충돌을 피할 때 씁니다. 단순한 raw copy가 필요하면 `doc.patch({ op: "copy", from, path })`를 그대로 쓰면 됩니다.

## query

`doc.query`는 JSONPath를 받아 match pointer를 반환합니다.

```ts
const result = doc.query("$..cards[?(@.status=='todo')]");

if (result.ok) {
  doc.patch(result.pointers.map((path) => ({
    op: "replace",
    path: `${path}/status`,
    value: "done",
  })));
}
```

규칙은 단순합니다.

```txt
query: JSONPath -> Pointer[]
patch: Pointer -> 변경
```

## selection

Selection은 선택 상태입니다. 방향은 `anchor`/`focus`로 보존하고, 멀티셀렉은 `selectionRanges`로 표현합니다.

```ts
doc.selection?.selectRanges([
  "/lists/0/cards/0",
  "/lists/0/cards/1",
]);

const selection = doc.selection?.snapshot();
```

Object member는 JSON 표준상 순서가 없으므로 range보다 명시 pointer 목록이 안전합니다.

```ts
doc.selection?.selectRanges([
  "/user/name",
  "/user/email",
]);
```

## clipboard

Clipboard는 copy/cut/paste payload 흐름입니다. source와 target을 명시하면 호출부에서 동작이 보입니다.

```ts
const source = doc.selection?.selectedPointers ?? [];
const copied = doc.clipboard.copy(source);

if (copied.ok) {
  const pasted = doc.clipboard.paste("/lists/1/cards/-");
  if (pasted.ok) pasted.applied;
}
```

직접 payload를 넣을 수도 있습니다.

```ts
doc.clipboard.pastePayload("/lists/0/cards/-", { id: "new", title: "New card" });
doc.clipboard.paste({ after: "/lists/0/cards/0" });
```

`selection.copy()`는 쓰지 않습니다. selection은 대상 상태이고, clipboard가 payload 흐름을 맡습니다.
`cut`, `paste`, `pastePayload`는 즉시 document에 적용됩니다. 성공 결과의 `applied`는 이미 적용된 patch 기록입니다.
이미 `/cards/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다. 기존 값을 기준으로 붙이면 `{ before: pointer }`, `{ after: pointer }`, `{ replace: pointer }`를 씁니다.

## history

History는 document patch와 inverse patch를 기록합니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Final" });
doc.history.undo();
doc.history.redo();
```

여러 변경을 한 undo entry로 묶을 수 있습니다.

```ts
doc.history.transaction({ label: "rename cards" }, () => {
  doc.patch({ op: "replace", path: "/lists/0/cards/0/title", value: "A" });
  doc.patch({ op: "replace", path: "/lists/0/cards/1/title", value: "B" });
});
```

selection 이동만으로는 history entry를 만들지 않습니다. document 변경 entry 안에 selection before/after가 같이 저장됩니다.

## can*

`can*`는 boolean이 아닙니다. 실행 가능 여부와 실패 이유를 같은 모양으로 돌려줍니다.
`canPaste`는 현재 clipboard buffer를 검사하고, `canPastePayload`는 직접 payload를 검사합니다.

```ts
const result = doc.canPastePayload("/lists/0/cards/-", candidateCard);

if (!result.ok) {
  console.log(result.code, result.reason);
}
```

대표 메서드:

```ts
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.canReplace("/title", "Ready");
doc.canDuplicate("/lists/0/cards/0", { rekey: { fields: ["id"], strategy: "suffix" } });
doc.canCopy(["/lists/0/cards/0"]);
doc.canCut(["/lists/0/cards/0"]);
doc.canPaste("/lists/1/cards/-");
doc.canPastePayload("/lists/1/cards/-", candidateCard);
doc.canUndo();
doc.canRedo();
```

## schema

Schema helper는 특정 pointer가 어떤 값을 받을 수 있는지 확인합니다.

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
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONDocumentHistory,
  type JSONDocumentMutationOk,
  type JSONDocumentPasteOptions,
  type JSONDocumentPasteTarget,
  type JSONPatchInput,
  type HistoryTransactionOptions,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type JSONPoint,
  type SelectionAction,
  type SelectionRange,
  type SelectionSource,
  type SelectionSnap,
  type SelectionState,
} from "zod-crud";
```

React hook은 별도 entrypoint입니다.

```ts
import { useJSONDocument } from "zod-crud/react";
```
