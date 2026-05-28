# zod-crud 표준 명세

상태: 살아 있는 명세. 현재 코드 동작이 정본이며, 코드, 문서, 테스트가 충돌하면 코드 동작을 확인하고 문서를 갱신한다.

## 0. 정체성

zod-crud는 Zod schema로 보호되는 headless JSON 편집 엔진이다. 공개 interface는 JSON 표준 어휘와 편집 도구 어휘를 다음 축으로 나눈다.

```txt
document
|-- patch(patch)
|-- duplicate(pointer, options)
|-- at(pointer)
|-- query(jsonPath)
|-- selection
|-- clipboard
|-- history
`-- can*
```

UI rendering, DOM event mapping, visual selection drawing, system clipboard access, drag and drop, keyboard shortcut policy는 라이브러리 본체가 아니다.

## 1. 규범 참조

| 표준 | 역할 |
| --- | --- |
| RFC 8259 / ECMA-404 JSON | state, payload, metadata 직렬화 |
| RFC 6901 JSON Pointer | 정확한 document 주소 |
| RFC 6902 JSON Patch | 변경 형식 |
| RFC 9535 JSONPath | 검색 형식 |
| W3C Selection vocabulary | anchor, focus, range, caret naming |
| Zod 4 | schema validation |
| React >=18 | optional `zod-crud/react` hook entrypoint |

규칙:

- Patch path는 JSON Pointer다.
- Query input은 JSONPath다.
- Query output은 Pointer다.
- JSONPath는 patch target이 아니다.
- State, patch operation, selection snapshot, clipboard payload, history metadata는 JSON-serializable이어야 한다.

## 2. 공개 Entry Point

패키지 consumer는 `zod-crud`와 `zod-crud/react`만 import한다. 공개 export 계약의 SSOT는 `packages/zod-crud/public-contract.json`이다.

Root 진입점:

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

React 진입점:

```ts
import { useJSONDocument } from "zod-crud/react";
```

`createJSONDocument`와 `useJSONDocument`는 같은 `JSONDocument<T>` 표면을 제공한다.

## 3. JSONDocument 표면

```ts
interface JSONDocument<T> {
  readonly value: T;
  readonly lastPatch: readonly JSONPatchOperation[];
  readonly selection: SelectionState | undefined;
  readonly clipboard: ClipboardState<T>;
  readonly history: JSONDocumentHistory;
  readonly schema: SchemaState;

  patch(operations: JSONPatchInput, metadata?: JSONChangeMetadata): JSONResult;
  commit(operations: readonly JSONPatchOperation[], options?: JSONDocumentCommitOptions): JSONResult;
  duplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONDocumentDuplicateResult<T>;
  load(value: T, options?: { preserveHistory?: boolean }): JSONResult;
  reset(value?: T): JSONResult;
  subscribe(listener: (applied: readonly JSONPatchOperation[], metadata?: JSONChangeMetadata) => void): () => void;

  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonPath: string): QueryResult;
  entries(path: Pointer): EntriesResult;

  canPatch(operations: JSONPatchInput): JSONCapabilityResult;
  canFind(jsonPath: string): JSONCapabilityResult;
  canReplace(path: Pointer, value: unknown): JSONCapabilityResult;
  canRemove(source: SelectionSource): JSONCapabilityResult;
  canMove(source: Pointer, target: Pointer): JSONCapabilityResult;
  canDuplicate(source: Pointer, options?: JSONDocumentDuplicateOptions): JSONCapabilityResult;
  canCopy(source: SelectionSource): JSONCapabilityResult;
  canCut(source: SelectionSource): JSONCapabilityResult;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canPastePayload(target: JSONDocumentPasteTarget, payload: unknown, options?: JSONDocumentPasteOptions): JSONCapabilityResult;
  canUndo(): JSONCapabilityResult;
  canRedo(): JSONCapabilityResult;
}
```

`can*`는 boolean이 아니라 이유 있는 결과를 반환한다.

`strict`는 `patch`, `commit`, `load`, `reset`에만 적용된다. 처리된 execution failure는 `JSONCrudError`를 만들고, `onError`는 throw나 return보다 먼저 실행된다. Strict mode는 throw하고 non-strict mode는 실패한 `JSONResult`를 반환한다. `can*`, read, schema, selection, clipboard, duplicate, history API는 각자의 Result, boolean, snapshot 표면을 유지한다.

기본값은 module load 시점의 `strict ?? process.env.NODE_ENV !== "production"`이다. Invalid initial value는 document 생성 전에 Zod parse error를 throw한다.

## 4. 변경

`patch`는 primary mutation entrypoint다. RFC 6902 operation 하나 또는 배열을 받는다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.patch([
  { op: "add", path: "/items/-", value: item },
  { op: "replace", path: "/meta/owner", value: "core" },
]);
```

`commit`은 patch operation 배열과 metadata, explicit final selection을 하나의 history entry로 기록할 수 있다.

```ts
const planned = doc.selection?.textPatch("A");
if (planned?.ok) {
  doc.commit(planned.patch, {
    label: "typing",
    origin: "keyboard",
    mergeKey: "title",
    selection: planned.selection,
  });
}
```

`duplicate(pointer, options)`는 공개 high-level sibling duplication verb다. 배열은 source 뒤에 삽입하고, object member는 `newKey`를 요구할 수 있으며, `rekey`는 id-like field 충돌을 피한다.

`duplicate`는 즉시 적용된다. 성공 결과의 `value`는 현재 document value이고 `applied`는 이미 적용된 patch record다. `applied`를 다시 `commit`하면 안 된다.

`load`는 schema-valid value로 document를 교체한다. `reset`은 초기값 또는 제공값으로 복원한다. `subscribe`는 적용된 patch record와 serializable metadata를 관찰한다.

## 5. 읽기와 검색

읽기는 document를 변경하지 않는다.

```ts
doc.at("/items/0/name");
doc.exists("/items/0");
doc.entries("/items");
doc.query("$.items[*].id");
```

JSONPath는 검색 언어다. Mutation input은 JSON Pointer `path`와 `from`을 가진 JSON Patch operation으로 유지한다.

```ts
const found = doc.query("$.items[?(@.done==false)]");
if (found.ok) {
  doc.patch(found.pointers.map((path) => ({ op: "replace", path: `${path}/done`, value: true })));
}
```

## 6. 선택

Selection은 command namespace가 아니라 JSON-safe state다. “무엇이 선택되었는가”를 답하고 selection planning helper를 제공한다.

핵심 vocabulary:

- `anchor`
- `focus`
- `selectionRanges`
- `selectedPointers`
- `primaryIndex`
- collapsed range로서의 `caret`

```ts
doc.selection?.collapse("/items/0");
doc.selection?.selectRanges(["/items/0", "/items/1"]);
doc.selection?.moveCursor("next", { points });
doc.selection?.extendCursor("next", { points });
doc.selection?.textPatch("replacement");
doc.selection?.deleteText();
doc.selection?.snapshot();
doc.selection?.restore(snapshot);
```

Document patch는 가능한 경우 selection pointer를 추적한다. 사라진 selection은 nearby sibling 또는 parent position으로 회복하거나 제거된다.

## 7. 클립보드

Clipboard는 JSON payload flow를 소유한다. Headless buffer이며 `navigator.clipboard`를 호출하지 않는다.

```ts
doc.clipboard.copy("/items/0");
doc.clipboard.cut(["/items/0", "/items/1"]);
doc.clipboard.paste("/items/-");
doc.clipboard.paste({ after: "/items/0" });
doc.clipboard.pastePayload("/items/-", { id: "new", name: "New" });
doc.clipboard.write(payload, { trustedPayload: true });
doc.clipboard.clear();
```

`copy`와 `cut`은 source를 생략하면 현재 selection source를 사용한다. `paste`는 target을 생략하면 current primary selection pointer를 사용한다. Direct payload paste는 `pastePayload`를 사용하며 먼저 buffer에 write할 필요가 없다.

`write(..., { trustedPayload: true })`는 호출자가 JSON-serializability boundary를 이미 소유할 때 payload JSON 검사를 건너뛴다. 기본적으로 payload는 buffer에 저장되기 전에 clone된다.

`cut`, `paste`, `pastePayload`는 즉시 적용된다. 성공 결과의 `value`는 현재 document value이고 `applied`는 이미 적용된 patch record다.

기존 값 기준 target은 `{ before: pointer }`, `{ after: pointer }`, `{ replace: pointer }`를 쓴다. 삽입 위치가 이미 있으면 `/items/-` 같은 Pointer를 그대로 쓴다.

Multi-source copy/cut은 array payload를 저장한다. 이 buffer를 array insertion target에 paste하면 기본적으로 spread된다. `{ spread: false }`는 array payload 자체를 하나의 값으로 넣을 때만 쓴다. Direct array payload paste는 multi-source 의도를 추론하지 않으므로 item별 sibling paste에는 `{ spread: true }`를 명시한다.

`discriminator_mismatch`는 schema violation이 아니며 `violations`를 노출하지 않는다. Capability check는 `code`와 `reason`으로 보고하고, clipboard paste mutation result는 `ClipboardPasteDiscriminatorMismatch` 형태의 `source`와 `expected`를 포함할 수 있다.

## 8. 히스토리

History는 forward patch와 inverse patch, selection metadata를 저장한다.

```ts
doc.history.undo();
doc.history.redo();
doc.history.mergeLast({ mergeKey: "typing:title" });
doc.commit([
  { op: "replace", path: "/items/0/name", value: "A" },
  { op: "replace", path: "/items/1/name", value: "B" },
], { label: "rename" });
```

알려진 burst edit은 하나의 operation array로 commit한다. `history.transaction`은 중간 document state를 관찰해야 하는 workflow에서 history entry를 묶지만, 반복 `doc.patch(...)` 호출을 한 번의 schema validation으로 바꾸지는 않는다.

`history.canUndo`와 `history.canRedo`는 UI disabled state를 위한 boolean이다. `canUndo()`와 `canRedo()`는 이유 있는 capability result를 반환한다.

History metadata는 앱이나 adapter가 document change에 붙이는 주석이다. 공개 history API는 undo/redo control surface이지 history entry inspector가 아니다. 저장, audit log, command label, collaboration adapter는 `doc.subscribe((patch, metadata) => ...)`로 패치 스트림을 mirror한다.

앱이 `"Undo Rename card"` 같은 label을 필요로 하면 command/action layer에서 `commit`이나 `history.transaction`에 넘긴 metadata를 보관한다. `mergeKey`는 app annotation이면서 history grouping hint다.

## 9. 성능

큰 문서의 hot path는 document facade인 `doc.patch`, `doc.commit`, `doc.canPatch`에 둔다. 공개 `applyPatch`는 외부 JSON 경계라서 입력 state 전체의 JSON 안전성을 확인한다. `applyPatchToTrustedState`는 호출자가 이미 state JSON 경계를 소유할 때 쓰는 pure core opt-in이다. Operation value와 schema validation은 여전히 실행되며 구조만 가진 schema는 document facade와 같은 trusted fast path를 사용할 수 있다.

빠른 document path는 신뢰된 document state와 구조만 가진 Zod schema에서만 적용된다. 대상 schema는 refinement, transform, check가 없는 object, array, record, scalar validator다. 지원 edit는 independent non-root `replace`, array `add`/`remove`/`copy`/`move`, same-array `add`/`remove` batch다. `refine`, `superRefine`, transform, check가 있으면 의도적으로 전체 루트 schema 검증으로 돌아간다.

```sh
npm run perf:core
```

## 10. Schema

모든 mutation은 제공된 Zod schema로 검증된다. 실패한 mutation은 atomic하다. State, selection, clipboard, history가 부분적으로 바뀌면 안 된다.

```ts
doc.schema.kind("/items/-", "insert");
doc.schema.at("/items/-", "insert");
doc.schema.describe("/items/-", "insert");
doc.schema.accepts("/items/-", candidate, "insert");
```

`violations`가 있는 validation result에서 각 `violation.path`는 RFC 6901 JSON Pointer다. `doc.schema.accepts(path, value, mode)`는 요청한 `path`에 Zod issue path를 붙인 `schema-slot` path를 보고한다. `canPatch`, `canPaste`, `canPastePayload`, `clipboard.paste`, `clipboard.pastePayload`, `canDuplicate`, `duplicate`는 먼저 JSON Patch operation을 plan 또는 preview한 뒤 `document-result` path를 보고한다.

Root validation issue는 empty JSON Pointer `""`를 사용한다. Record value는 `/meta/newKey` 같은 concrete member pointer로 검증한다. `insert` mode는 주로 array insertion slot용이다.

## 11. 테스트 계약

공개 동작 테스트는 root export와 `JSONDocument` surface로 진입한다. Private source structure를 assert하지 않는다. Internal module은 구현 응집도를 위해 존재할 수 있지만 external contract가 아니다.

공개 export 계약 SSOT는 `packages/zod-crud/public-contract.json`이다. Package smoke test, docs consistency test, docs evaluation은 이 파일을 읽는다.

릴리스 전 필수 검증:

- `npm run release:check`
- `npm run standard:check`
- `npm run typecheck -w zod-crud`
- `npm test -w zod-crud`
- `npm run build -w zod-crud`
- `npm run smoke:package -w zod-crud`
- `npm run docs:evaluate`
- `npm run verify`
- `npm run perf:core`
- `npm run pack:library`
- `npm run playground:typecheck`
- `npm run playground:test`
- `npm run build -w @zod-crud/site`
