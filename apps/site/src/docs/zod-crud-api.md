# zod-crud API

이 문서는 앱 코드에서 직접 쓰는 공개 API만 앞에 둡니다. 내부 폴더 구조를 몰라도 `schema -> document -> can* -> change -> result` 흐름으로 사용할 수 있습니다.

```txt
import 표면
|-- zod-crud
|   |-- createJSONDocument
|   |-- applyPatch / JSON Pointer helper
|   `-- public type
`-- zod-crud/react
    `-- useJSONDocument
```

## 기준

- 공개 import는 `zod-crud`와 `zod-crud/react`입니다.
- JSON Pointer는 정확한 주소입니다. patch, selection, clipboard target은 Pointer를 씁니다.
- JSONPath는 검색입니다. `doc.query(...)`는 여러 match를 찾고 Pointer 목록을 돌려줍니다.
- JSON Patch는 변경 형식입니다. 실행 진입점은 `doc.patch(...)`와 `doc.commit(...)`입니다.
- Duplicate는 JSON Patch `copy`보다 의도가 높은 sibling 복제입니다. 실행 진입점은 `doc.duplicate(...)`입니다.
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

## 작업별 진입점

| 작업 | 진입점 | 알아야 하는 규칙 |
| --- | --- | --- |
| 현재 값 읽기 | `doc.value` | schema-valid JSON 값입니다. |
| 한 위치 읽기 | `doc.at(pointer)` | raw value가 아니라 결과 객체를 반환합니다. |
| 하위 항목 나열 | `doc.entries(pointer)` | object, record, array entry를 Pointer와 함께 돌려줍니다. |
| 여러 위치 찾기 | `doc.query(jsonPath)` | JSONPath는 변경 언어가 아닙니다. 결과 Pointer로 patch를 만듭니다. |
| 값 추가, 변경, 제거, 이동 | `doc.patch(...)`, `doc.commit(...)` | `path`와 `from`은 JSON Pointer입니다. |
| 실행 전 검증 | `doc.can*` | 실패 code, reason, violations를 UI에 쓸 수 있습니다. |
| sibling 복제 | `doc.duplicate(pointer, options)` | 성공하면 즉시 적용됩니다. |
| 선택 | `doc.selection` | 선택 사실을 JSON-safe snapshot으로 보관합니다. |
| 복사/붙여넣기 | `doc.clipboard` | source와 target을 명시하면 동작이 드러납니다. |
| undo/redo | `doc.history` | patch와 inverse patch를 기록합니다. |
| 위치별 schema 확인 | `doc.schema` | insert/value 위치가 어떤 값을 받는지 확인합니다. |

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

`doc.commit(...)`과 `doc.canPatch(...)`는 batch를 계획하거나 기록하므로 operation arrays를 받습니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.commit([{ op: "replace", path: "/title", value: "Ready" }], { label: "rename" });
```

`history.transaction`은 history entry를 묶지만 반복 `doc.patch(...)` 호출을 한 번의 schema validation으로 바꾸지는 않습니다.

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

```txt
검색: JSONPath -> Pointer[]
변경: Pointer -> JSON Patch
```

JSONPath는 변경 언어가 아닙니다. `doc.query(...)`로 Pointer를 찾은 뒤, 그 Pointer로 `doc.patch(...)`를 만듭니다.

## can*

`can*`는 boolean이 아닙니다. 실행 가능 여부와 실패 이유를 같은 모양으로 돌려줍니다. `canPaste`는 현재 clipboard buffer를 검사하고, `canPastePayload`는 직접 payload를 검사합니다.

```ts
const result = doc.canPastePayload("/lists/0/cards/-", candidateCard);

if (!result.ok) {
  console.log(result.code, result.reason);
}
```

대표 method:

```ts
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.canFind("$..cards[?(@.status=='todo')]");
doc.canReplace("/title", "Ready");
doc.canRemove(["/lists/0/cards/0"]);
doc.canMove("/lists/0/cards/0", "/lists/1/cards/-");
doc.canDuplicate("/lists/0/cards/0", { rekey: { fields: ["id"], strategy: "suffix" } });
doc.canCopy(["/lists/0/cards/0"]);
doc.canCut(["/lists/0/cards/0"]);
doc.canPaste("/lists/1/cards/-");
doc.canPastePayload("/lists/1/cards/-", candidateCard);
doc.canUndo();
doc.canRedo();
```

Validation failure의 `violations[].path`는 RFC 6901 JSON Pointer입니다.

```txt
schema.accepts(path, value, mode)
`-- schema-slot path: 입력한 path 뒤에 Zod issue path를 붙입니다.

canPatch / canPastePayload / canPaste / duplicate
`-- document-result path: patch preview 후 실제 document 위치를 돌려줍니다.
```

Root issue는 empty Pointer `""`입니다. `discriminator_mismatch`는 schema violation이 아니므로 `violations`가 없습니다. `can*` capability result는 `code`와 `reason` 중심으로 보고, `doc.clipboard.paste(...)`와 `doc.clipboard.pastePayload(...)` mutation result는 `source`와 `expected`를 포함할 수 있습니다.

앱은 이 Pointer로 field error, cell error, focus를 배치할 수 있습니다. zod-crud는 headless JSON 좌표만 제공하고, rendering/focus/message presentation은 앱 책임입니다.

## error policy

예상 가능한 편집 실패는 Result로 표현합니다. `can*`, read, schema, selection, clipboard, duplicate, history API는 `strict`를 쓰지 않고 각자의 Result, boolean, snapshot surface를 유지합니다.

`strict`는 document state 실행 method에만 적용됩니다.

```txt
doc.patch(...)
doc.commit(...)
doc.load(...)
doc.reset(...)
```

이 method들이 실패하면 zod-crud는 operation label과 실패한 `JSONResult`를 가진 `JSONCrudError`를 만듭니다. `strict: false`이면 실패 `JSONResult`를 반환하고, `strict: true`이면 throw합니다. 기본값은 module load 시점의 `process.env.NODE_ENV !== "production"`입니다.

`onError(error)`는 이 document execution failure에서 throw 또는 return 전에 호출됩니다. 모든 실패 Result를 관찰하는 전역 hook은 아닙니다.

`createJSONDocument(schema, initial)`의 initial validation은 document가 생기기 전 boundary입니다. 실패하면 `JSONCrudError`가 아니라 Zod parse error가 throw됩니다. `trustedInitial: true`는 호출자가 이미 그 validation boundary를 소유할 때만 씁니다.

Pointer helper는 throw/null 쌍입니다. `parsePointer(pointer)`는 invalid pointer에서 `PointerSyntaxError`를 throw하고, `tryParsePointer(pointer)`는 `null`을 반환합니다.

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

`doc.duplicate`는 즉시 적용됩니다. `applied`는 이미 적용된 patch 기록이므로 다시 `commit`하지 않습니다. `rekey`는 복제 payload 안의 id-like field 충돌을 피할 때 씁니다. 단순한 raw copy가 필요하면 `doc.patch({ op: "copy", from, path })`를 그대로 쓰면 됩니다.

## selection

Selection은 선택 상태입니다. 방향은 `anchor`/`focus`로 보존하고, multi-select는 `selectionRanges`로 표현합니다.

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
| multi-select | `addRange(range)`, `removeRange(range)`, `togglePointer(pointer)`, `selectRanges(ranges)` |
| cursor 이동 | `moveCursor(direction)`, `extendCursor(direction)`, `resolveCursor(direction)` |
| 정렬과 span | `orderPrimaryRange(options)`, `orderRanges(options)`, `spansForPointer(pointer)` |
| text edit 계획 | `textEdits(replacement)`, `textPatch(replacement)`, `deleteText(options)` |
| 상태 helper | `empty()`, `isSelected(pointer)`, `snapshot()`, `toJSON()`, `restore(snapshot)`, `subscribe(listener)` |

Object member는 JSON 표준상 순서가 없으므로 range보다 명시 pointer 목록이 안전합니다.

```ts
const source = doc.selection?.selectedPointers ?? [];
doc.clipboard.copy(source);
doc.clipboard.cut(source);
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

`selection.copy()`는 쓰지 않습니다. selection은 대상 상태이고, clipboard가 payload 흐름을 맡습니다. `cut`, `paste`, `pastePayload`는 즉시 document에 적용됩니다. 성공 결과의 `applied`는 이미 적용된 patch 기록입니다.

이미 `/cards/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다. 기존 값을 기준으로 붙이면 `{ before: pointer }`, `{ after: pointer }`, `{ replace: pointer }`를 씁니다.

Pointer 배열을 copy하면 clipboard payload도 배열입니다. 여러 source를 담은 clipboard buffer는 array 삽입 target에 기본으로 펼쳐집니다. 배열 payload 자체를 하나의 값으로 붙여넣어야 할 때만 `spread: false`를 넘깁니다. `pastePayload`로 배열 payload를 직접 넣을 때 각 항목을 sibling으로 펼치려면 `spread: true`를 넘깁니다.

## 트리 편집 cookbook

Tree 의미는 앱 책임입니다. zod-crud는 JSON을 검증하고 patch/selection/clipboard/history를 처리합니다. indent, outdent, visible row focus, toolbar action은 앱이 JSON Pointer와 JSON Patch로 번역합니다.

```ts
doc.patch({ op: "add", path: "/nodes/0/children/-", value: node });
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0/children/-" });
doc.patch({ op: "move", from: "/nodes/0/children/1", path: "/nodes/1" });
```

같은 배열 move는 RFC 6902처럼 source를 먼저 제거한 뒤 destination에 add합니다. `/nodes/0`을 한 칸 아래로 내릴 때는 `/nodes/2`가 아니라 `/nodes/1`을 씁니다.

Selection은 DOM focus가 아니라 headless JSON 상태입니다. 보이는 row focus는 앱의 local state나 DOM focus와 같이 관리하고, 선택 사실은 pointer로 동기화합니다.

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

History metadata는 앱/adapter가 document change에 붙이는 JSON-safe 주석입니다.

```ts
doc.commit(patch, {
  label: "typing",
  origin: "keyboard",
  mergeKey: "title",
  selection: nextSelection,
});

doc.history.mergeLast({ mergeKey: "title" });
```

공개 history는 patch/inverse patch 기반 undo/redo 제어 표면입니다. history entry inspector가 아닙니다.

저장, audit log, command label, collaboration adapter가 metadata를 읽어야 하면 `doc.subscribe((patch, metadata) => ...)`로 패치 스트림을 mirror하세요. 이 stream은 적용된 patch event를 보여주며 내부 undo stack과 1:1이라고 가정하면 안 됩니다. `history.transaction`은 여러 patch event를 하나의 undo entry로 묶을 수 있고, `history.mergeLast`는 새 patch event 없이 undo stack만 갱신합니다.

앱이 `"Undo Rename card"` 같은 label이 필요하면 command/action layer에서 같은 metadata를 보관합니다. `mergeKey`는 app annotation이면서 history grouping hint입니다.

## schema

Schema helper는 특정 pointer가 어떤 값을 받을 수 있는지 확인합니다.

```ts
doc.schema.at("/lists/0/cards/-", "insert");
doc.schema.kind("/lists/0/cards/-", "insert");
doc.schema.describe("/lists/0/cards/-", "insert");
doc.schema.accepts("/lists/0/cards/-", candidateCard, "insert");
```

Record value는 concrete member pointer로 확인하세요. 예: `/meta/newKey`. `insert` mode는 주로 array insertion slot용입니다.

## performance

큰 문서의 hot path는 document facade인 `doc.patch`, `doc.commit`, `doc.canPatch`를 기준으로 둡니다. 공개 `applyPatch`는 외부 JSON 경계라서 입력 state 전체의 JSON 안전성을 확인합니다. state가 이미 그 boundary를 통과했다면 `applyPatchToTrustedState`는 state scan을 건너뛰고 document와 같은 trusted plain-schema fast path를 쓸 수 있습니다.

빠른 document path는 현재 state가 신뢰된 document state이고 schema가 구조만 가진 Zod schema일 때만 탑니다. 지원 edit는 independent non-root `replace`, array `add`/`remove`/`copy`/`move`, same-array `add`/`remove` batch입니다.

`refine`, `superRefine`, transform, check가 있으면 의도적으로 전체 루트 schema 검증으로 돌아갑니다.

```sh
npm run perf:core
```

## 앱 액션 예시

앱 코드는 보통 public API를 얇게 감싸서 제품 action을 만듭니다. patch를 직접 만들 때는 `canPatch`를 먼저 보고, `duplicate`와 clipboard mutation은 성공 결과를 다시 commit하지 않습니다.

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

## 검증

배포 전에는 release gate를 기준으로 봅니다. `npm run release:check`는 root `verify`, `standard:check`, `perf:core`, `pack:library`를 순서대로 실행합니다. `npm run verify`는 package 검증 뒤 `docs:evaluate`를 실행해서 README, SPEC, 이 문서, `llms.txt`, release notes, public export 이름, 100-loop ledger drift를 같이 막습니다. `standard:check`는 draft core standard와 public conformance suite를 확인합니다.

```sh
npm run release:check
```

## 공개 export

```ts
import {
  JSONCrudError,
  PointerSyntaxError,
  appendSegment,
  applyOperation,
  applyPatch,
  applyPatchToTrustedState,
  buildPointer,
  createJSONDocument,
  escapeSegment,
  lastSegment,
  lastSegmentIndex,
  parentPointer,
  parsePointer,
  trackPointer,
  tryParsePointer,
  unescapeSegment,
  withLastSegment,
  type HistoryTransactionOptions,
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONDocumentCommitOptions,
  type JSONDocumentDuplicateError,
  type JSONDocumentDuplicateOptions,
  type JSONDocumentDuplicateResult,
  type JSONDocumentHistory,
  type JSONDocumentOptions,
  type JSONDocumentPasteOptions,
  type JSONDocumentPasteTarget,
  type JSONPatchInput,
  type JSONPatchOperation,
  type SelectionPoint,
  type JSONResult,
  type Pointer,
  type ClipboardCopyOptions,
  type ClipboardCopyError,
  type ClipboardCopyOk,
  type ClipboardCopyResult,
  type ClipboardCutError,
  type ClipboardCutOk,
  type ClipboardCutOptions,
  type ClipboardCutResult,
  type ClipboardEmpty,
  type ClipboardMutationOk,
  type ClipboardPasteDiscriminatorMismatch,
  type ClipboardPasteError,
  type ClipboardPasteResult,
  type ClipboardReadOk,
  type ClipboardReadOptions,
  type ClipboardReadResult,
  type ClipboardState,
  type ClipboardWriteOptions,
  type EntriesResult,
  type EntryKind,
  type QueryResult,
  type ReadEntry,
  type ReadResult,
  type SchemaDescription,
  type SchemaDescriptionResult,
  type SchemaErrorCode,
  type SchemaErrorResult,
  type SchemaKind,
  type SchemaKindResult,
  type SchemaPathMode,
  type SchemaQueryResult,
  type SchemaState,
  type SelectionOptions,
  type SelectionPointObject,
  type SelectionOrderedRange,
  type SelectionOrderedRangeEntry,
  type SelectionAffinity,
  type SelectionContext,
  type SelectionCursorDirection,
  type SelectionCursorErrorCode,
  type SelectionCursorOptions,
  type SelectionCursorResult,
  type SelectionCursorTarget,
  type SelectionDirection,
  type SelectionEdge,
  type SelectionMode,
  type SelectionOrderErrorCode,
  type SelectionOrderOptions,
  type SelectionPointOrderResult,
  type SelectionPointerSpan,
  type SelectionPointerSpansResult,
  type SelectionRange,
  type SelectionRangeInput,
  type SelectionRangeOrderResult,
  type SelectionRangesOrderResult,
  type SelectionScopeErrorCode,
  type SelectionScopeOptions,
  type SelectionScopeResult,
  type SelectionScopeTarget,
  type SelectionSnap,
  type SelectionSource,
  type SelectionSpanOptions,
  type SelectionState,
  type SelectionType,
  type DeleteSelectionTextResult,
  type ReplaceSelectionTextResult,
  type SelectionTextDeleteDirection,
  type SelectionTextDeleteOptions,
  type SelectionTextEdit,
  type SelectionTextEditErrorCode,
  type SelectionTextEditOptions,
  type SelectionTextEditsResult,
  type ClipboardSource,
} from "zod-crud";
```

React hook은 별도 entrypoint입니다.

```ts
import { useJSONDocument } from "zod-crud/react";
```

## 관리자 메모

이 섹션은 사용자 API 사용법이 아니라 release 확인용입니다.

Package API는 `zod-crud`와 `zod-crud/react`입니다. 전체 public export 목록은 `packages/zod-crud/public-contract.json`이 기준입니다.
