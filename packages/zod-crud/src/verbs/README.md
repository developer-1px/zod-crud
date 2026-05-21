# verbs/ — 편집 어휘 composer (pure)

SPEC §0 의 10 verbs 가 1 파일 1 동사로 매핑된다.

## 규약 (lint-equivalent rules)

1. **pure** — 모든 verb 는 명시 인자만 받는 pure 함수. React 의존 0. side effect 0.
2. **selection 자동 사용 금지** — `state.selection` 을 verb 안에서 자동 읽지 않는다. selection 이 필요하면 document/command facade 가 명시 인자로 넘긴다.
3. **`verbs/*` 끼리 import 금지** — 합성은 `createCommands` / `createJSONDocument` facade 에서만. cut 이 copy 를 import 하지 않는다. 대신 facade 가 cut 의 결과로 copy 의 payload + remove 의 patch 를 같이 만든다.
4. **`core/*` 만 의존** — 의존 방향: verbs/ → core/. 다른 verb / hook 의존 금지.

## 4대 기둥 ↔ 10 verbs ↔ RFC 매핑

| 기둥 | verbs | RFC/표준 substrate |
|------|-------|---------------------|
| Selection (어디) | `select.ts`, `find.ts` | RFC 6901 + W3C Selection / RFC 9535 |
| Edit (뭐를) | `move.ts`, `duplicate.ts`, `replace.ts` | RFC 6902 (move/copy/replace + 합성) |
| Clipboard (외부 round-trip) | `cut.ts`, `copy.ts`, `paste.ts` | RFC 6902 (remove/add) + RFC 8259 fragment |
| Undo (되돌림) | `undo.ts`, `redo.ts` | RFC 6902 inverse + history stack |

= 10. closure.

## 파일 시그니처 규약

```ts
// 일반 mutating verb
export function X(state, ...args, schema): { next, patch, ...payload? }

// read-only verb (select, find, copy)
export function X(state, ...args): { ...result }
```

`next` = patch 적용 후 state. `patch` = RFC 6902 patch (history commit 근거).
mutating verb 의 schema 인자는 P4 의 preFlight gate 통과를 위함.
