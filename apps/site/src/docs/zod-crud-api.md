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

Source layout SSOT:

```txt
src/
├─ index.ts      zod-crud
├─ react.ts      zod-crud/react
├─ application/  document facade assembly
├─ domain/       editing, selection, schema, tracking rules
└─ foundation/   JSON Patch, JSON Pointer, JSONPath, history, errors
```

`application`, `domain`, `foundation`은 package subpath가 아닙니다.
공개 진입점 소스 경로는 `src/index.ts`, `src/react.ts`입니다.

## 작업별 진입점

| 작업 | 진입점 |
| --- | --- |
| 값 추가, 변경, 제거, 이동 | `doc.patch(...)` |
| sibling 복제 | `doc.duplicate(pointer, options)` |
| 여러 위치 찾기 | `doc.query(jsonPath)` 후 반환 Pointer로 patch |
| 멀티셀렉 복사/이동 | `doc.selection?.selectedPointers`를 `doc.clipboard.copy/cut`에 전달 |
| 외부 payload 붙여넣기 | `doc.clipboard.pastePayload(target, payload, options)` |
| 실행 전 검증 | `doc.can*` |
| 되돌리기/다시하기 | `doc.canUndo()` 확인 후 `doc.history.undo()` |

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

`doc.at(pointer)`는 raw value가 아니라 결과 객체를 반환합니다.

```ts
const result = doc.at("/lists/0/cards/0/title");
if (result.ok) {
  result.value;
}
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

`doc.commit(...)`과 `doc.canPatch(...)`는 batch를 계획하거나 기록하므로 operation 배열을 받습니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.commit([{ op: "replace", path: "/title", value: "Ready" }], { label: "rename" });
```

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

자주 쓰는 검색은 아래 형태로 둡니다.

```ts
doc.query("$..cards[?(@.status=='todo')]");
doc.query("$.lists[*].cards[*]");
```

JSONPath는 변경 언어가 아닙니다. `doc.query(...)`로 Pointer를 찾은 뒤, 그 Pointer로 `doc.patch(...)`를 만듭니다.

## selection

Selection은 선택 상태입니다. 방향은 `anchor`/`focus`로 보존하고, 멀티셀렉은 `selectionRanges`로 표현합니다.

```ts
doc.selection?.selectRanges([
  "/lists/0/cards/0",
  "/lists/0/cards/1",
]);

const selection = doc.selection?.snapshot();
```

자주 보는 selection 표면은 아래와 같습니다.

| 필요 | API |
| --- | --- |
| 현재 선택 읽기 | `selectedPointers`, `primaryPointer`, `anchorPointer`, `focusPointer`, `caret` |
| 접기와 확장 | `collapse(point)`, `setBaseAndExtent(anchor, focus)`, `extend(point)` |
| 멀티셀렉 | `addRange(range)`, `removeRange(range)`, `togglePointer(pointer)`, `selectRanges(ranges)` |
| cursor 이동 | `moveCursor(direction)`, `extendCursor(direction)`, `resolveCursor(direction)` |
| 텍스트 편집 계획 | `textPatch(replacement)`, `deleteText(options)` |
| 직렬화 | `snapshot()`, `toJSON()`, `restore(snapshot)`, `subscribe(listener)` |

Object member는 JSON 표준상 순서가 없으므로 range보다 명시 pointer 목록이 안전합니다.

```ts
doc.selection?.selectRanges([
  "/user/name",
  "/user/email",
]);
```

멀티셀렉을 복사하거나 자를 때는 선택 상태에서 Pointer 목록을 꺼내 clipboard에 넘깁니다.

```ts
const source = doc.selection?.selectedPointers ?? [];
doc.clipboard.copy(source);
doc.clipboard.cut(source);
```

`copy()`와 `cut()`은 source를 생략하면 현재 selection을 사용합니다. 하지만 앱 코드와 테스트에서는 source를 명시하는 쪽이 읽기 쉽습니다.

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

Pointer 배열을 copy하면 clipboard payload도 배열입니다. 붙여넣을 때 각 항목을 sibling으로 펼쳐 넣으려면 `spread: true`를 넘깁니다. pointer 배열이 1개만 담아도 같은 규칙입니다.

```ts
doc.clipboard.copy(["/lists/0/cards/0"]);

const target = "/lists/1/cards/-";
const options = {
  spread: true,
  rekey: { fields: ["id"], strategy: "suffix" },
} as const;

if (doc.canPaste(target, options).ok) {
  doc.clipboard.paste(target, options);
}
```

## tree editing cookbook

Tree 의미는 앱 책임입니다. zod-crud는 JSON을 검증하고 patch/selection/clipboard/history를 처리합니다. indent, outdent, visible row focus, toolbar action은 앱이 JSON Pointer와 JSON Patch로 번역합니다.

```ts
type Node = { id: string; text: string; children: Node[] };

const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    id: z.string(),
    text: z.string(),
    children: z.array(NodeSchema),
  }),
);

const OutlineSchema = z.object({ nodes: z.array(NodeSchema) });
```

Tree pointer는 보통 아래처럼 생깁니다.

```txt
/nodes/0
/nodes/0/children/0
/nodes/0/children/0/children/0
```

자주 쓰는 tree action은 patch로 충분합니다.

```ts
// child 추가
doc.patch({ op: "add", path: "/nodes/0/children/-", value: node });

// /nodes/0 뒤에 sibling 추가
doc.patch({ op: "add", path: "/nodes/1", value: node });

// 같은 배열 안에서 위/아래 이동
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0" }); // up
doc.patch({ op: "move", from: "/nodes/0", path: "/nodes/1" }); // down one

// 이전 sibling 밑으로 indent
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0/children/-" });

// parent 다음 sibling 자리로 outdent
doc.patch({ op: "move", from: "/nodes/0/children/1", path: "/nodes/1" });
```

같은 배열 move는 RFC 6902처럼 source를 먼저 제거한 뒤 destination에 add합니다. `/nodes/0`을 한 칸 아래로 내릴 때는 `/nodes/2`가 아니라 `/nodes/1`을 씁니다.

Selection은 DOM focus가 아니라 headless JSON 상태입니다. 보이는 row focus는 앱의 local state나 DOM focus와 같이 관리하고, 선택 사실은 pointer로 동기화합니다.

```ts
doc.selection?.selectRanges(["/nodes/0"]);
const selected = doc.selection?.primaryPointer;
```

## history

History는 document patch와 inverse patch를 기록합니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Final" });
doc.history.undo();
doc.history.redo();
```

알고 있는 여러 변경은 operation 배열로 한 번 commit합니다. schema validation, history 기록, subscriber 알림이 한 번의 document change로 묶입니다.

```ts
doc.commit([
  { op: "replace", path: "/lists/0/cards/0/title", value: "A" },
  { op: "replace", path: "/lists/0/cards/1/title", value: "B" },
], { label: "rename cards" });
```

History metadata는 JSON으로 직렬화 가능한 patch entry metadata입니다.

```ts
doc.commit(patch, {
  label: "typing",
  origin: "keyboard",
  mergeKey: "title",
  selection: nextSelection,
});

doc.history.mergeLast({ mergeKey: "title" });
```

`history.transaction`은 각 단계가 중간 document state를 읽어야 할 때만 씁니다. history entry는 묶지만 반복 `doc.patch(...)` 호출을 한 번의 schema validation으로 바꾸지는 않습니다.

selection 이동만으로는 history entry를 만들지 않습니다. document 변경 entry 안에 selection before/after가 같이 저장됩니다.

## performance

큰 문서의 hot path는 document facade인 `doc.patch`, `doc.commit`, `doc.canPatch`를 기준으로 둡니다. Public `applyPatch`는 외부 JSON boundary라서 입력 state 전체의 JSON 안전성을 확인합니다.

빠른 document path는 현재 state가 trusted document state이고 schema가 plain structural Zod schema일 때만 탑니다. 대상은 refinement, transform, check가 없는 object, array, record, scalar schema입니다. 지원 edit는 independent non-root `replace`, array `add`/`remove`/`copy`/`move`, same-array `add`/`remove` batch입니다.

`refine`, `superRefine`, transform, check가 있으면 의도적으로 full root schema validation으로 돌아갑니다.

```sh
npm run perf:core
```

## can*

`can*`는 boolean이 아닙니다. 실행 가능 여부와 실패 이유를 같은 모양으로 돌려줍니다.
`canPaste`는 현재 clipboard buffer를 검사하고, `canPastePayload`는 직접 payload를 검사합니다.

```ts
const result = doc.canPastePayload("/lists/0/cards/-", candidateCard);

if (!result.ok) {
  console.log(result.code, result.reason);
}
```

실패 결과는 UI validation 메시지로 바로 쓸 수 있습니다.

```ts
const blocked = doc.canPastePayload("/lists/0/cards/-", invalidCard);

if (!blocked.ok && blocked.code === "schema_violation") {
  blocked.violations?.map((violation) => ({
    path: violation.path,
    message: violation.message,
  }));
}
```

대표 메서드:

```ts
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.canFind("$..cards[?(@.status=='todo')]");
doc.canReplace("/title", "Ready");
doc.canDuplicate("/lists/0/cards/0", { rekey: { fields: ["id"], strategy: "suffix" } });
doc.canCopy(["/lists/0/cards/0"]);
doc.canCut(["/lists/0/cards/0"]);
doc.canPaste("/lists/1/cards/-");
doc.canPastePayload("/lists/1/cards/-", candidateCard);
doc.canUndo();
doc.canRedo();
```

## 작업 레이어 예시

앱 코드는 보통 public API를 얇게 감싸서 도메인 액션을 만듭니다. patch를 직접 만들 때는 `canPatch`를 먼저 보고, `duplicate`와 clipboard mutation은 성공 결과를 다시 commit하지 않습니다.

```ts
type Card = { id: string; slug: string; title: string; status: "todo" | "doing" | "done" };
type Board = { lists: { id: string; title: string; cards: Card[] }[] };

const rekey = { fields: ["id", "slug"], strategy: "suffix" as const };

function createBoardActions(doc: JSONDocument<Board>) {
  return {
    addCard(listIndex: number, card: Card) {
      const patch = [{ op: "add", path: `/lists/${listIndex}/cards/-`, value: card }];
      const can = doc.canPatch(patch);
      return can.ok ? doc.commit(patch, { label: "addCard" }) : can;
    },

    duplicateCard(cardPointer: Pointer) {
      const can = doc.canDuplicate(cardPointer, { rekey });
      return can.ok ? doc.duplicate(cardPointer, { rekey }) : can;
    },

    copySelectedCardsTo(sourcePointers: readonly Pointer[], targetListIndex: number) {
      const copied = doc.clipboard.copy(sourcePointers);
      if (!copied.ok) return copied;

      return doc.clipboard.paste(`/lists/${targetListIndex}/cards/-`, {
        spread: true,
        rekey,
      });
    },

    pastePayloadAfter(cardPointer: Pointer, payload: unknown) {
      return doc.clipboard.pastePayload({ after: cardPointer }, payload, { rekey });
    },

    undo() {
      return doc.canUndo().ok ? doc.history.undo() : false;
    },
  };
}
```

여기서 `/cards/-`는 삽입 위치입니다. `{ after: cardPointer }`는 이미 존재하는 card를 기준으로 붙인다는 뜻입니다.

## schema

Schema helper는 특정 pointer가 어떤 값을 받을 수 있는지 확인합니다.

```ts
doc.schema.kind("/lists/0/cards/-", "insert");
doc.schema.describe("/lists/0/cards/-", "insert");
doc.schema.accepts("/lists/0/cards/-", candidateCard, "insert");
```

## verification

배포 전에는 root gate를 기준으로 봅니다. `npm run verify`는 package 검증 뒤 `docs:evaluate`를 실행해서 README, SPEC, 이 문서, `llms.txt`, release notes, source-layout SSOT, 100-loop ledger drift를 같이 막습니다.

```sh
npm run verify
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
  type JSONDocumentCommitOptions,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONDocumentHistory,
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
