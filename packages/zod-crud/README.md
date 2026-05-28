# zod-crud

Zod schema로 보호되는 headless JSON 편집 엔진입니다. UI component가 아니라 편집 도구의 core입니다. 앱은 rendering, focus, button, shortcut, drag/drop, 제품별 command 이름을 소유하고, zod-crud는 JSON Pointer 주소, JSON Patch 변경, JSONPath 검색, schema validation, selection, clipboard payload, undo/redo history를 소유합니다.

공식 사이트와 데모: https://developer-1px.github.io/zod-crud/

## 왜 zod-crud인가

폼, CMS block, kanban board, outliner, settings editor는 UI가 달라도 같은 일을 합니다. 값을 추가하고, 바꾸고, 제거하고, 옮기고, 복제하고, 선택하고, 복사하고, 붙여넣고, 되돌립니다.

zod-crud는 이 규칙을 UI component 밖으로 빼서 하나의 document facade로 제공합니다.

```txt
schema
`-- document
    |-- Pointer로 한 위치를 가리킴
    |-- JSONPath로 여러 위치를 찾음
    |-- can*으로 실행 가능 여부를 확인함
    |-- patch / commit / duplicate / clipboard로 변경함
    `-- Result, selection, history를 앱이 UI에 반영함
```

처음 쓰는 사람은 내부 폴더를 몰라도 됩니다. 필요한 것은 schema, JSON value, Pointer, change, Result입니다.

## 설치

```sh
npm install zod-crud zod
```

`zod`는 peer dependency입니다. React를 쓰는 앱만 `zod-crud/react`를 import합니다.

## 작업별 진입점

| 하고 싶은 일 | 공개 API |
| --- | --- |
| headless document 만들기 | `createJSONDocument(schema, initial, options?)` |
| React에서 같은 표면 쓰기 | `useJSONDocument(schema, initial, options?)` |
| 현재 값 읽기 | `doc.value`, `doc.lastPatch` |
| 한 위치 읽기 | `doc.at(pointer)` |
| 하위 항목 나열 | `doc.entries(pointer)` |
| 여러 위치 찾기 | `doc.query(jsonPath)` |
| 값 추가, 교체, 제거, 이동 | `doc.patch(...)`, `doc.commit(...)` |
| 실행 전 확인 | `doc.canPatch`, `doc.canFind`, `doc.canReplace`, `doc.canRemove`, `doc.canMove`, `doc.canDuplicate`, `doc.canCopy`, `doc.canCut`, `doc.canPaste`, `doc.canPastePayload`, `doc.canUndo`, `doc.canRedo` |
| sibling 복제 | `doc.duplicate(pointer, options)` |
| 선택 상태 저장 | `doc.selection` |
| copy, cut, paste, 직접 payload paste | `doc.clipboard` |
| undo, redo, merge, transaction | `doc.history` |
| 위치별 schema 확인 | `doc.schema.at`, `doc.schema.kind`, `doc.schema.describe`, `doc.schema.accepts` |

## 시작 예제

```ts
import { z } from "zod";
import { createJSONDocument } from "zod-crud";

const Card = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]),
});

const doc = createJSONDocument(Card, {
  id: "c1",
  title: "Write docs",
  status: "todo",
}, {
  history: 100,
  selection: true,
});

const patch = [{ op: "replace", path: "/status", value: "doing" }] as const;

if (doc.canPatch(patch).ok) {
  doc.commit(patch, { label: "change status" });
}
```

React에서는 같은 `JSONDocument<T>` 표면을 hook으로 받습니다.

## React — `useJSONDocument`

```tsx
import { z } from "zod";
import { useJSONDocument } from "zod-crud/react";

const Schema = z.object({
  title: z.string(),
  tasks: z.array(z.object({ id: z.string(), done: z.boolean() })),
});

export function App() {
  const doc = useJSONDocument(Schema, { title: "", tasks: [] }, { history: 50 });

  return (
    <>
      <input
        value={doc.value.title}
        onChange={(event) =>
          doc.patch({ op: "replace", path: "/title", value: event.target.value })
        }
      />
      <button
        onClick={() =>
          doc.patch({
            op: "add",
            path: "/tasks/-",
            value: { id: crypto.randomUUID(), done: false },
          })
        }
      >
        add task
      </button>
      <button onClick={() => doc.history.undo()} disabled={!doc.canUndo().ok}>
        undo
      </button>
    </>
  );
}
```

## 문서 Facade

`createJSONDocument`와 `useJSONDocument`는 같은 document facade를 노출합니다. React hook은 render lifecycle만 연결합니다.

| 표면 | 역할 |
| --- | --- |
| `doc.value` | 현재 schema-valid JSON 값 |
| `doc.patch(patch)` | JSON Patch operation 하나 또는 배열 적용 |
| `doc.commit(operations, options)` | operation 배열과 metadata, 최종 selection을 하나의 변경으로 기록 |
| `doc.duplicate(pointer, options)` | sibling 복제와 optional `rekey` |
| `doc.load(value)` | 외부 JSON 값을 schema 검증 뒤 document로 교체 |
| `doc.reset(value?)` | 초기값 또는 제공값을 schema 검증 뒤 복원 |
| `doc.subscribe(listener)` | 적용된 patch stream과 metadata 구독 |
| `doc.at(pointer)` | 한 Pointer 위치를 `ReadResult`로 읽기 |
| `doc.exists(pointer)` | Pointer 존재 여부 확인 |
| `doc.query(jsonPath)` | JSONPath 검색 결과 Pointer 반환 |
| `doc.entries(pointer)` | object/array child entry 나열 |
| `doc.selection` | headless selection 상태 |
| `doc.clipboard` | headless clipboard payload buffer |
| `doc.history` | undo/redo 제어 표면 |
| `doc.can*` | boolean이 아니라 이유 있는 capability result |
| `doc.schema` | Pointer 위치별 schema helper |

## Pointer, JSONPath, Patch

Patch path와 selection/clipboard target은 JSON Pointer입니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });
doc.patch([
  { op: "replace", path: "/settings/owner", value: "editor" },
  { op: "add", path: "/lists/0/cards/-", value: card },
]);
```

JSONPath는 값을 찾는 언어이며 직접 변경하지 않습니다. `doc.query(jsonPath)`로 Pointer를 받은 뒤 그 Pointer로 `doc.patch(...)`를 만듭니다.

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

`doc.at(pointer)`는 raw value가 아니라 `ReadResult`를 반환합니다.

```ts
const result = doc.at("/lists/0/cards/0/title");
if (result.ok) result.value;
```

`doc.patch(...)`는 operation 하나 또는 operation 배열을 받습니다. `doc.commit(...)`과 `doc.canPatch(...)`는 batch를 계획하거나 기록하므로 operation arrays를 받습니다.

알려진 burst edit은 operation 배열을 만들고 `doc.patch(...)`나 `doc.commit(...)`을 한 번 호출합니다. `history.transaction`은 history entry를 묶지만 반복 `doc.patch(...)` 호출을 한 번의 schema validation으로 바꾸지는 않습니다.

## can* 결과

`can*`는 boolean이 아닙니다. UI disabled reason, validation message, command palette 상태를 같은 결과 객체로 만들 수 있도록 이유를 포함합니다.

```ts
const can = doc.canPastePayload("/lists/0/cards/-", candidateCard);

if (!can.ok) {
  can.code;
  can.reason;
  can.violations;
}
```

`violations[].path`는 RFC 6901 JSON Pointer입니다. `doc.schema.accepts(path, value, mode)`는 요청한 schema 위치 기준인 `schema-slot` path를 보고합니다. `canPatch`, `canPastePayload`, `canPaste`, `canDuplicate` 같은 mutation preflight는 patch preview 뒤 실제 문서 결과 위치인 `document-result` path를 보고합니다.

`/items/-`는 schema helper에서는 `/items/-/name`처럼 남을 수 있지만, mutation preflight에서는 현재 배열 길이에 따라 `/items/2/name` 같은 실제 index가 됩니다.

`discriminator_mismatch`는 schema violation이 아니므로 `violations`를 노출하지 않습니다. Capability result는 `code`와 `reason`으로 보고하고, clipboard paste mutation result는 필요하면 `source`와 `expected`를 포함합니다.

## 오류 정책

`strict`는 `doc.patch`, `doc.commit`, `doc.load`, `doc.reset` 같은 document execution method에만 적용됩니다. `can*`, read, schema, selection, clipboard, duplicate, history API는 각자의 Result, boolean, snapshot 표면을 유지하고 `strict`를 쓰지 않습니다.

기본값은 module load 시점의 `strict ?? process.env.NODE_ENV !== "production"`입니다. 처리된 document execution failure가 생기면 `onError(JSONCrudError)`가 먼저 호출됩니다. 그 뒤 strict mode는 `JSONCrudError`를 throw하고, non-strict mode는 실패한 `JSONResult`를 반환합니다.

초기 값이 invalid이면 document가 생기기 전에 Zod parse error가 throw됩니다. `trustedInitial: true`는 호출자가 그 validation boundary를 이미 소유할 때만 사용합니다.

## 복제

`doc.duplicate(pointer, options)`는 raw RFC 6902 `copy`가 아니라 sibling 복제 의도를 표현합니다. 배열에서는 source 바로 뒤에 삽입하고, object member 복제에는 `newKey`가 필요합니다. `rekey`는 id-like field 충돌을 피할 때 사용합니다.

```ts
const duplicated = doc.duplicate("/lists/0/cards/0", {
  rekey: { fields: ["id", "slug"], strategy: "suffix" },
});

if (duplicated.ok) {
  duplicated.value;
  duplicated.applied;
}
```

`duplicate`, `clipboard.cut`, `clipboard.paste`, `clipboard.pastePayload`는 성공하면 즉시 document를 변경합니다. 성공 결과의 `applied`는 이미 적용된 patch 기록이므로 다시 `commit`하지 않습니다.

## 선택

Selection은 DOM focus가 아니라 JSON-safe state입니다. bulk 작업에는 선택된 Pointer를 명시 source로 넘기는 편이 좋습니다.

```ts
doc.selection?.selectRanges([
  "/lists/0/cards/0",
  "/lists/0/cards/1",
]);

const source = doc.selection?.selectedPointers ?? [];
doc.clipboard.copy(source);
```

| 필요 | API |
| --- | --- |
| 현재 선택 읽기 | `selectedPointers`, `primaryPointer`, `anchorPointer`, `focusPointer`, `caret` |
| 접기와 확장 | `collapse(point)`, `setBaseAndExtent(anchor, focus)`, `extend(point)` |
| multi-select | `addRange(range)`, `removeRange(range)`, `toggleRange(range)`, `togglePointer(pointer)`, `selectRanges(ranges)` |
| cursor 이동 | `moveCursor(direction)`, `extendCursor(direction)`, `resolveCursor(direction)` |
| text edit 계획 | `textPatch(replacement)`, `deleteText(options)` |
| 직렬화와 복원 | `snapshot()`, `toJSON()`, `restore(snapshot)`, `subscribe(listener)` |

JSON object member는 표준상 순서가 없습니다. object child range에 순서 의미를 주기보다 명시 Pointer list를 사용합니다.

## 클립보드

Clipboard는 copy/cut/paste payload 흐름을 맡습니다. Selection은 무엇이 선택되었는지만 기록합니다.

Core clipboard는 `navigator.clipboard`가 아니라 headless JSON payload buffer입니다. Browser system clipboard는 `@zod-crud/clipboard-web` extension에서 조립합니다.

```ts
const copied = doc.clipboard.copy(["/lists/0/cards/0"]);

if (copied.ok) {
  doc.clipboard.paste("/lists/1/cards/-");
}
```

삽입 위치를 이미 알고 있으면 `/items/-`나 `/lists/1/cards/-` 같은 Pointer를 그대로 넘깁니다. 기존 값을 기준으로 붙일 때는 `{ before: pointer }`, `{ after: pointer }`, `{ replace: pointer }`를 사용합니다.

```ts
doc.clipboard.pastePayload("/lists/0/cards/-", candidateCard);
doc.clipboard.paste({ after: "/lists/0/cards/0" });
```

Pointer 배열을 copy/cut하면 clipboard payload도 배열입니다. 여러 source를 담은 buffer를 array insertion target에 paste하면 기본적으로 item을 펼쳐 넣습니다. 배열 payload 자체를 하나의 값으로 넣어야 할 때만 `{ spread: false }`를 넘깁니다. 직접 array payload를 `pastePayload`에 넘기면서 각 item을 sibling으로 넣으려면 `{ spread: true, rekey }`를 `canPastePayload(...)`와 `clipboard.pastePayload(...)`에 같은 옵션으로 넘깁니다.

```ts
const target = "/lists/1/cards/-";
const options = { spread: true, rekey: { fields: ["id"], strategy: "suffix" } } as const;

if (doc.canPaste(target, options).ok) {
  doc.clipboard.paste(target, options);
}
```

## 히스토리

History는 document patch와 inverse patch를 기록합니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Final" });
doc.history.undo();
doc.history.redo();
```

알고 있는 여러 변경은 operation 배열로 한 번 commit합니다.

```ts
doc.commit([
  { op: "replace", path: "/lists/0/cards/0/title", value: "A" },
  { op: "replace", path: "/lists/0/cards/1/title", value: "B" },
], { label: "rename cards" });
```

History metadata는 앱이나 adapter가 document change에 붙이는 JSON-safe 주석입니다.

```ts
doc.commit(patch, {
  label: "typing",
  origin: "keyboard",
  mergeKey: "title",
  selection: nextSelection,
});

doc.history.mergeLast({ mergeKey: "title" });
```

공개 history API는 undo/redo control surface이지 history entry inspector가 아닙니다. 저장, audit log, command label, collaboration adapter가 metadata를 읽어야 하면 `doc.subscribe((patch, metadata) => ...)`로 패치 스트림을 mirror합니다. `history.transaction`은 여러 patch event를 하나의 undo entry로 묶을 수 있고, `history.mergeLast`는 새 patch event 없이 undo stack만 갱신합니다.

앱이 `"Undo Rename card"` 같은 label을 필요로 하면 command/action layer에서 `commit`이나 `history.transaction`에 넘긴 metadata를 같이 보관합니다. `mergeKey`는 app annotation이면서 history grouping hint입니다.

## Schema helper

Schema helper는 Pointer 위치가 어떤 값을 받는지 묻는 API입니다.

```ts
doc.schema.kind("/lists/0/cards/-", "insert");
doc.schema.at("/lists/0/cards/-", "insert");
doc.schema.describe("/lists/0/cards/-", "insert");
doc.schema.accepts("/lists/0/cards/-", candidateCard, "insert");
```

## 순수 core

Root helper는 React-free이며 외부 JSON 경계에서 유용합니다.

대표 helper는 `applyOperation`, `applyPatch`, `applyPatchToTrustedState`입니다. `applyOperation`과 `applyPatch`는 pure function입니다. 같은 input은 같은 output을 만듭니다. `applyPatch`는 외부 JSON 경계라서 입력 state 전체의 JSON 안전성을 확인합니다. 호출자가 이미 그 state JSON 경계를 소유한다면 `applyPatchToTrustedState`를 사용할 수 있습니다.

Pointer helper는 `parsePointer`, `tryParsePointer`, `buildPointer`, `escapeSegment`, `unescapeSegment`, `parentPointer`, `lastSegment`, `lastSegmentIndex`, `appendSegment`, `withLastSegment`, `trackPointer`입니다.

```ts
import * as z from "zod";
import { applyPatch } from "zod-crud";

const Schema = z.object({ title: z.string(), tags: z.array(z.string()) });
const initial = { title: "draft", tags: [] };

const r = applyPatch(Schema, initial, [
  { op: "add", path: "/tags/-", value: "docs" },
  { op: "replace", path: "/title", value: "final" },
]);

if (r.result.ok) {
  console.log(r.state);
}
```

## 직렬화

State, operation, selection snapshot, patch record는 JSON입니다.

```ts
import * as z from "zod";

const Schema = z.object({ title: z.string() });
const state = { title: "draft" };

const json = JSON.stringify(state);
const restored = Schema.parse(JSON.parse(json));
const safe = Schema.safeParse(JSON.parse(json));
```

Operation은 `application/json-patch+json`으로 보낼 수 있습니다.

```ts
const operations = [{ op: "replace", path: "/title", value: "final" }];

fetch("/api/save", {
  method: "PATCH",
  headers: { "Content-Type": "application/json-patch+json" },
  body: JSON.stringify(operations),
});
```

## 성능 경계

큰 문서의 hot path는 document facade인 `doc.patch`, `doc.commit`, `doc.canPatch`에 둡니다.

빠른 document path는 현재 state가 신뢰된 document state이고 schema가 구조만 가진 Zod schema일 때만 적용됩니다. 대상은 refinement, transform, check가 없는 object, array, record, scalar validator입니다. 지원 edit는 independent non-root `replace`, root object edit, same-array field, nested-field, element `replace` batch, array `add`/`remove`/`copy`/`move`, same-array `add`/`remove` batch입니다.

`refine`, `superRefine`, transform, check가 있는 schema는 의도적으로 전체 루트 schema 검증으로 돌아갑니다.

```sh
npm run perf:core
```

## 트리 편집 Cookbook

트리 의미론은 앱 책임입니다. zod-crud는 JSON을 검증하고 변경합니다. 앱은 indent, outdent, visible-row focus, toolbar command를 JSON Pointer와 JSON Patch operation으로 번역합니다.

```txt
/nodes/0
/nodes/0/children/0
/nodes/0/children/0/children/0
```

```ts
doc.patch({ op: "add", path: "/nodes/0/children/-", value: node });
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0/children/-" });
doc.patch({ op: "move", from: "/nodes/0/children/1", path: "/nodes/1" });
```

같은 배열 move는 RFC 6902처럼 source를 먼저 제거한 뒤 destination에 add합니다. `/nodes/0`을 한 칸 아래로 내릴 때는 `/nodes/2`가 아니라 `/nodes/1`을 씁니다.

## 관리자 메모

이 섹션은 패키지 사용에 필요하지 않습니다. release check를 맞추기 위한 계약입니다.

패키지 API는 `zod-crud`와 `zod-crud/react`로 제한됩니다. 전체 공개 export 계약은 `packages/zod-crud/public-contract.json`입니다.

`prepublishOnly`는 root `release:check`로 위임됩니다. root `release:check`는 `verify`, `standard:check`, `perf:core`, `pack:library`를 순서대로 실행합니다. root `verify`에는 `docs:evaluate`가 포함되어 README, SPEC, site docs, `llms.txt`, release notes, 공개 export, source-layout SSOT, drift ledger를 확인합니다. `standard:check`는 draft core standard와 public conformance suite를 확인합니다.

```sh
npm run docs:evaluate
npm run standard:check
npm run release:check
```

## 공개 Export

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
