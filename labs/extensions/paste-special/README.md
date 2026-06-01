# @zod-crud/paste-special

Lab extension for paste special.

Use it when a host receives a clipboard/import/drop payload that may need to be
adapted before it can be pasted into the current document.

## Scope

- let the host classify and adapt external payloads
- let the host attach paste options such as `spread` and `rekey`
- preflight the adapted payload through `doc.canPaste`
- execute through `doc.paste`
- return structured compatibility, capability, and execution errors

## Non-goals

- browser clipboard access
- text/HTML/TSV parsing
- product-specific payload schemas
- visual paste target selection
- custom ID policy beyond core `rekey`
- plugin registration
- `zod-crud` internal imports

```ts
const paste = createPasteSpecial(doc, {
  adapt({ payload }) {
    if (isExternalCard(payload)) {
      return {
        ok: true,
        payload: {
          id: payload.id,
          title: payload.name,
          done: false,
        },
        options: {
          rekey: { fields: ["id"], strategy: "suffix" },
        },
      };
    }
    return { ok: false, code: "unsupported_payload", reason: "card payload expected" };
  },
});

const canPaste = paste.canPaste({ payload: externalPayload, target: "/cards/-" });
if (canPaste.ok) paste.paste(canPaste.input);
```

## Friction report

- Core `canPaste`/`paste` already handles schema validation, discriminator
  checks, spread paste, and rekeying.
- The missing feature-level boundary is not another core primitive. It is the
  repeated app code that adapts external payloads, chooses paste options, and
  preserves diagnostics.
- This lab should stay separate from `snippets`: snippets own known reusable
  payloads, while paste special owns unknown or cross-product payloads.
