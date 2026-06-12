# json-document API

이 문서는 앱 코드에서 직접 쓰는 공개 API만 다룹니다. 내부 폴더 구조를 몰라도 `schema -> document -> can* -> change -> result` 흐름으로 사용할 수 있습니다.

```txt
import 표면
|-- json-document
|   |-- createJSONDocument
|   |-- applyPatch / JSON Pointer helper
|   `-- public type
`-- @interactive-os/json-document/react
    `-- useJSONDocument
```

## 기준

- 공개 import는 `@interactive-os/json-document`와 `@interactive-os/json-document/react`입니다.
- JSON Pointer는 정확한 주소입니다. patch, selection, clipboard target은 Pointer를 씁니다.
- JSONPath는 검색입니다. `doc.find(...)`는 여러 match를 찾고 Pointer 목록을 돌려줍니다.
- JSON Patch는 변경 형식입니다. 실행 진입점은 `doc.patch(...)`와 `doc.commit(...)`입니다.
- `can*`는 boolean이 아니라 이유가 있는 결과입니다.

## 시작

```ts
import { z } from "zod";
import { createJSONDocument } from "@interactive-os/json-document";

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
import { useJSONDocument } from "@interactive-os/json-document/react";

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
| 한 위치 읽기 | `doc.at(pointer)` | raw value가 아니라 `ReadResult`를 반환합니다. |
| 하위 항목 나열 | `doc.entries(pointer)` | object, record, array entry를 Pointer와 함께 돌려줍니다. |
| 여러 위치 찾기 | `doc.find(jsonPath)`, `doc.query(jsonPath)` | JSONPath는 변경 언어가 아닙니다. 결과 Pointer로 patch를 만듭니다. |
| 값 삽입, 변경, 삭제, 이동 | `doc.insert(...)`, `doc.replace(...)`, `doc.delete(...)`, `doc.move(...)` | `path`, `source`, `target`은 JSON Pointer입니다. |
| 실행 전 검증 | `doc.can*` | 실패 code, reason, violations를 UI에 쓸 수 있습니다. |
| sibling 복제 | `doc.duplicate(pointer?, options)` | source를 생략하면 현재 primary selection을 사용합니다. |
| 선택 | `doc.selection` | 선택 사실을 JSON-safe snapshot으로 보관합니다. |
| 복사/붙여넣기 | `doc.copy(...)`, `doc.cut(...)`, `doc.paste(...)`, `doc.paste(target, { payload })` | source와 target을 명시하면 동작이 드러납니다. |
| undo/redo | `doc.undo()`, `doc.redo()`, `doc.history` | patch와 inverse patch를 기록합니다. |
| 위치별 schema 확인 | `doc.schema` | insert/value 위치가 어떤 값을 받는지 확인합니다. |

## document

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
doc.find("$..cards[?(@.status=='todo')]");
doc.query("$..cards[?(@.status=='todo')]");
doc.entries("/lists/0/cards");
```

`doc.at(pointer)`는 raw value가 아니라 결과 객체를 반환합니다.

## Pointer 경계

Root document Pointer는 빈 문자열 `""`입니다. `doc.replace(value)`처럼 path 없는 overload는 현재 selection을 기본값으로 쓸 수 있으므로, root를 바꿀 때는 path overload를 명시합니다.

```ts
doc.replace("", nextDocument);
doc.canReplace("", nextDocument);
```

앱 adapter에서 plain string path를 받으면 json-document 경계에서 한 번 확인합니다.

```ts
import { tryParsePointer, type Pointer } from "@interactive-os/json-document";

function asPointer(path: string): Pointer | null {
  return tryParsePointer(path) === null ? null : path as Pointer;
}
```

제품 command는 app-local wrapper로 감싸는 편이 안전합니다.

```ts
function replaceWholeSheet(nextSheet: Sheet) {
  return doc.replace("", nextSheet);
}
```

## patch

`doc.patch`는 RFC 6902 JSON Patch를 적용합니다. 단일 operation과 operation 배열을 모두 받을 수 있습니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Ready" });

doc.commit([
  { op: "replace", path: "/title", value: "Ready" },
], { label: "rename" });
```

Patch의 `path`와 `from`은 JSON Pointer입니다. JSONPath를 patch에 직접 넣지 않습니다.

## query

`doc.find`는 편집 feature verb로 JSONPath match pointer를 반환합니다. `doc.query`는 같은 engine을 lower-level read primitive로 노출합니다.

```ts
const result = doc.find("$..cards[?(@.status=='todo')]");

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

## can*

`can*`는 실행 가능 여부와 실패 이유를 같은 모양으로 돌려줍니다.

```ts
const result = doc.canPaste("/lists/0/cards/-", { payload: candidateCard });

if (!result.ok) {
  result.code;
  result.reason;
  result.violations;
}
```

대표 method:

```ts
doc.canPatch([{ op: "replace", path: "/title", value: "Ready" }]);
doc.canFind("$..cards[?(@.status=='todo')]");
doc.canInsert("/lists/0/cards/-", candidateCard);
doc.canReplace("/title", "Ready");
doc.canDelete(["/lists/0/cards/0"]);
doc.canMove("/lists/0/cards/0", "/lists/1/cards/-");
doc.canDuplicate("/lists/0/cards/0", { rekey: { fields: ["id"], strategy: "suffix" } });
doc.canCopy(["/lists/0/cards/0"]);
doc.canCut(["/lists/0/cards/0"]);
doc.canPaste("/lists/1/cards/-");
doc.canUndo();
doc.canRedo();
```

Validation failure의 `violations[].path`는 RFC 6901 JSON Pointer입니다. `doc.schema.accepts(...)`는 요청한 schema 위치 기준의 `schema-slot` path를, mutation preflight는 patch preview 후 document 결과 위치 기준의 `document-result` path를 돌려줍니다.

## error policy

예상 가능한 편집 실패는 Result로 표현합니다. `strict`는 `doc.patch`, `doc.commit`, `doc.load`, `doc.reset` 실행 실패 정책입니다.

기본값은 `strict: false`입니다. `strict: true`를 명시한 document에서 처리된
execution failure는 `JSONDocumentError`를 throw할 수 있습니다. `can*`와 top-level
`doc.undo()` / `doc.redo()`는 Result를 반환합니다.

## duplicate

`doc.duplicate`는 sibling 복제를 표현합니다. source를 생략하면 현재 primary selection을 사용합니다. 배열에서는 source 바로 뒤에 삽입하고, object member를 복제할 때는 `newKey`를 명시합니다.

```ts
const duplicated = doc.duplicate("/lists/0/cards/0", {
  rekey: { fields: ["id", "slug"], strategy: "suffix" },
});
```

`doc.duplicate`, `doc.cut`, `doc.paste`는 즉시 적용됩니다. 성공 결과의 `applied`는 이미 적용된 patch 기록이므로 다시 `commit`하지 않습니다.

## selection

Selection은 DOM focus가 아니라 JSON-safe state입니다.

```ts
doc.selection?.selectRanges([
  "/lists/0/cards/0",
  "/lists/0/cards/1",
]);

const source = doc.selection?.selectedPointers ?? [];
doc.copy(source);
```

Object member는 JSON 표준상 순서가 없으므로 range보다 명시 pointer 목록이 안전합니다.

## clipboard

Clipboard는 copy/cut/paste payload 흐름입니다. source와 target을 명시하면 호출부에서 동작이 보입니다.

```ts
const copied = doc.copy(["/lists/0/cards/0"]);

if (copied.ok) {
  doc.paste("/lists/1/cards/-");
}
```

직접 payload를 넣을 수도 있습니다.

```ts
doc.paste("/lists/0/cards/-", { payload: { id: "new", title: "New card" } });
doc.paste({ after: "/lists/0/cards/0" });
```

이미 `/cards/-` 같은 삽입 위치가 있으면 pointer를 그대로 넘깁니다. 기존 값을 기준으로 붙이면 `{ before: pointer }`, `{ after: pointer }`, `{ replace: pointer }`를 씁니다.

Pointer 배열을 copy/cut하면 clipboard payload도 배열입니다. 여러 source를 담은 clipboard buffer는 array 삽입 target에 기본으로 펼쳐집니다.

## history

History는 document patch와 inverse patch를 기록합니다.

```ts
doc.patch({ op: "replace", path: "/title", value: "Final" });
doc.undo();
doc.redo();
```

알고 있는 여러 변경은 operation 배열로 한 번 commit합니다. schema validation, history 기록, subscriber 알림이 한 번의 document change로 묶입니다.

## schema

Schema helper는 특정 pointer가 어떤 값을 받을 수 있는지 확인합니다.

```ts
doc.schema.at("/lists/0/cards/-", "insert");
doc.schema.kind("/lists/0/cards/-", "insert");
doc.schema.describe("/lists/0/cards/-", "insert");
doc.schema.accepts("/lists/0/cards/-", candidateCard, "insert");
```

## performance

큰 문서의 hot path는 document facade인 `doc.patch`, `doc.commit`, `doc.canPatch`를 기준으로 둡니다. 공개 `applyPatch`는 외부 JSON 경계입니다.

Document 내부 state는 신뢰된 document state입니다. schema가 구조만 가진 Zod schema이고 edit가 independent non-root `replace` 또는 array edit에 해당하면 document path는 더 좁은 검증 경로를 쓸 수 있습니다. Refinement, transform, check가 있는 schema는 전체 루트 schema 검증으로 돌아갑니다.

## 트리 편집 cookbook

Tree 의미는 앱 책임입니다. json-document는 JSON을 검증하고 patch/selection/clipboard/history를 처리합니다. indent, outdent, visible row focus, toolbar action은 앱이 JSON Pointer와 JSON Patch로 번역합니다.

```ts
doc.patch({ op: "add", path: "/nodes/0/children/-", value: node });
doc.patch({ op: "move", from: "/nodes/1", path: "/nodes/0/children/-" });
doc.patch({ op: "move", from: "/nodes/0/children/1", path: "/nodes/1" });
```
