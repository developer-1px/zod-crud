# zod-crud Extensions

zod-crud core는 JSON editing foundation만 소유합니다. UI, persistence, system clipboard, collection command, stable id lookup 같은 앱별 책임은 extension이나 host code에서 조립합니다.

Extension은 core에 plugin으로 등록하지 않습니다. public `JSONDocument` surface를 받아 함수로 compose합니다.

## 설치

필요한 package만 설치합니다.

```sh
npm install zod-crud @zod-crud/collection
```

## 공식 extension

공식 extension 목록과 lab 후보 목록은 repo catalog에서 생성됩니다. `packages/*`에 있는 publishable `@zod-crud/*` package가 공식 extension이고, `labs/extensions/*`는 후보입니다. public 문서에서 lab package를 공식 extension이라고 부르지 않습니다.

## 선택 기준

| 상황 | 먼저 쓰는 표면 |
| --- | --- |
| 한 위치를 정확히 바꿈 | core `doc.insert`, `doc.replace`, `doc.delete`, `doc.move` |
| ordered array item UX | `@zod-crud/collection` |
| outliner promote/demote | `@zod-crud/outline` |
| JSONPath 결과 일괄 변경 | `@zod-crud/bulk-edit` |
| 저장됨/dirty 표시 | `@zod-crud/dirty-state` |
| local draft save/restore | `@zod-crud/persist-web` |
| browser clipboard I/O | `@zod-crud/clipboard-web` |
| product search semantics, focus, keyboard, rendered value 검색 | host app |

## 제품별 fit

| 제품 패턴 | 맞는 extension | host가 남기는 책임 |
| --- | --- | --- |
| spreadsheet tabs/order | `collection`, `persist-web`, `dirty-state`, `bulk-edit` | grid selection, formula/rendered-value search, TSV clipboard |
| rich editor JSON truth layer | `persist-web`, `dirty-state`, `collection` | ProseMirror/DOM selection adapter, markdown/parser semantics, editor command 이름 |
| outliner rows | `outline`, `collection`, `clipboard-web`, `persist-web` | focus recovery, keyboard policy, default node factory |
| review/copy cleanup lab | lab `search-replace`, lab `comments` | review workflow, UI thread state, publish policy |

## Rich editor host pattern

ProseMirror 같은 editor는 DOM/contenteditable state를 소유하고, zod-crud document는 저장할 JSON truth layer를 소유합니다.

```ts
const persistence = createDocumentPersistence(doc, { key: "article-draft" });

editorView.dispatch(editorTransaction);
doc.commit([
  { op: "replace", path: "/doc", value: prosemirrorToJson(editorView.state.doc) },
], { label: "edit rich text", origin: "prosemirror" });

await persistence.save();
```

Editor selection, schema-specific parsing, Markdown/HTML serialization, IME handling은 host editor 책임입니다. zod-crud는 최종 JSON payload의 validation, persistence, dirty state, undo/redo boundary를 조립합니다.

## collection

```ts
import { createCollection } from "@zod-crud/collection";

const collection = createCollection(doc);

collection.moveAfter("/lists/0/cards/0", "/lists/1/cards/0");
collection.duplicateAfter("/slides/0", {
  rekey: { fields: ["id"], strategy: "suffix" },
});
collection.deleteItems(["/tabs/1", "/tabs/3"]);
```

## outline

```ts
import { createOutline } from "@zod-crud/outline";

const outline = createOutline(doc);

outline.demote("/children/1");
outline.promote("/children/0/children/1");
```

## schema-form

```ts
import { createSchemaForm } from "@zod-crud/schema-form";

const form = createSchemaForm(doc, "/settings");

if (form.ok) {
  const title = form.fields.find((field) => field.key === "title");
  title?.set("Published");
}
```

## dirty-state

```ts
import { createDirtyState } from "@zod-crud/dirty-state";

const dirty = createDirtyState(doc);

dirty.isDirty();
dirty.markClean();
```

## bulk-edit

```ts
import { createBulkEdit } from "@zod-crud/bulk-edit";

const bulk = createBulkEdit(doc);

if (bulk.canReplaceAll("$.items[*].done", true).ok) {
  bulk.replaceAll("$.items[*].done", true);
}
```

## patch-log

```ts
import { createPatchLog } from "@zod-crud/patch-log";

const log = createPatchLog(doc);

doc.replace("/title", "Next");
log.replayInto(otherDoc);
```

## persist-web

```ts
import { createDocumentPersistence } from "@zod-crud/persist-web";

const persistence = createDocumentPersistence(doc, { key: "draft" });

await persistence.save();
await persistence.restore({ restoreSelection: true });

const watch = persistence.watch();
doc.replace("/title", "Draft");
await watch.flush();
watch.stop();
```

## clipboard-web

```ts
import { createWebClipboard } from "@zod-crud/clipboard-web";

const webClipboard = createWebClipboard(doc);

await webClipboard.copy("/lists/0/cards/0");
await webClipboard.paste("/lists/1/cards/-", {
  rekey: { fields: ["id"], strategy: "suffix" },
});
```
