# @zod-crud/clipboard-web

Web clipboard extension functions for `zod-crud`.

```sh
npm install zod-crud @zod-crud/clipboard-web
```

```ts
import { createJSONDocument } from "zod-crud";
import { createWebClipboard } from "@zod-crud/clipboard-web";

const doc = createJSONDocument(schema, initial);
const clipboard = createWebClipboard(doc);

const copied = await clipboard.copy("/cards/0");
if (!copied.ok) {
  const reason = copied.reason;
}

const pasted = await clipboard.paste("/cards/-", {
  rekey: { fields: ["id"], strategy: "suffix" },
});
if (!pasted.ok) {
  const reason = pasted.reason;
}
```

This package is an extension. It does not add plugin registration to the core document. It composes the public `JSONDocument` interface with a small text clipboard host.

Core `doc.clipboard` is the headless JSON payload buffer. `@zod-crud/clipboard-web` is only the system clipboard bridge.

## Host

By default, `createWebClipboard(doc)` uses `navigator.clipboard` when available. Browsers usually require a secure context, user activation, focus, and/or permission for `readText` and `writeText`. Denied browser access returns a Result instead of throwing.

Tests, server rendering, and custom shells should inject a host:

The host shape is `{ readText, writeText }`.

```ts
const host = {
  text: "",
  readText() {
    return this.text;
  },
  writeText(text: string) {
    this.text = text;
  },
};

const clipboard = createWebClipboard(doc, { host });
```

If the host is missing `readText`, read/paste/canPaste return `clipboard_unavailable`. If the host is missing `writeText`, copy/cut/writePayload return `clipboard_unavailable`.

## Methods

| Method | Role |
| --- | --- |
| `copy(source?, options?)` | `doc.clipboard.copy` 후 text host에 JSON payload 쓰기 |
| `cut(source?, options?)` | host write 성공 뒤 `doc.clipboard.cut` 실행 |
| `read()` | text host에서 읽고 zod-crud clipboard payload로 decode |
| `writePayload(payload, metadata?)` | document 변경 없이 payload를 text host에 쓰기 |
| `canPaste(target, options?)` | host text를 읽고 `doc.canPaste(target, { payload })` 실행 |
| `canPasteText(target, text, options?)` | 주어진 text로 `doc.canPaste(target, { payload })` 실행 |
| `paste(target, options?)` | host text를 읽고 `doc.paste(target, { payload })` 실행 |
| `pasteText(target, text, options?)` | 주어진 text로 `doc.paste(target, { payload })` 실행 |

All methods return zod-crud style Results. Check `.ok` before assuming success.

Paste targets are the same as core clipboard targets: `"/items/-"`, `{ before: pointer }`, `{ after: pointer }`, or `{ replace: pointer }`. Pass the same paste options to `canPaste` and `paste`.

## Payload Format

The default codec stores a JSON text envelope:

```ts
{
  kind: "zod-crud.clipboard+json",
  version: 1,
  payload,
  source,
  sources,
}
```

Raw JSON text without the envelope is accepted as `payload` for paste. Provide a custom `codec` only when another app needs a different wire format.
