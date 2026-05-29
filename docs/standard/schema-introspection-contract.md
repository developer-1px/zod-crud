# Schema Introspection Contract

상태: 1.0 semantic freeze 기준.

Schema introspection은 앱이 JSON document의 특정 주소에 어떤 값이 들어갈 수
있는지 headless하게 묻는 public API다. 이 계약은 form renderer, import review,
paste target guard, generated editor UI가 internal schema walker를 몰라도 같은
질문을 할 수 있게 한다.

## 규범

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`는 규범 키워드다.

Public schema API는 schema object의 private 구조를 노출하면 안 된다. 앱은
`SchemaKind`, `SchemaDescription`, `JSONCapabilityResult`만으로 capability와 UI
hint를 구성해야 한다.

## SchemaState

Document는 schema surface를 제공한다.

```ts
type SchemaState = {
  at(path: Pointer, mode?: SchemaPathMode): SchemaQueryResult;
  kind(path: Pointer, mode?: SchemaPathMode): SchemaKindResult;
  describe(path: Pointer, mode?: SchemaPathMode): SchemaDescriptionResult;
  accepts(path: Pointer, value: unknown, mode?: SchemaPathMode): JSONCapabilityResult;
};
```

각 method는 실패해도 document state를 바꾸면 안 된다.

## SchemaPathMode

`SchemaPathMode`는 path가 무엇을 가리키는지 정한다.

| Mode | 의미 |
| --- | --- |
| `value` | 현재 document value가 있는 주소의 schema를 묻는다 |
| `insert` | 해당 주소에 삽입될 값이 따라야 하는 schema slot을 묻는다 |

기본 mode는 `value`다.

`value` mode는 기존 값 검사, field editor, 현재 node kind 표시와 맞다.
`insert` mode는 add, paste, duplicate target, import mapping처럼 아직 값이 없는
slot을 검사할 때 쓴다.

## SchemaKind

`SchemaKind`는 앱이 schema를 거칠게 분류하는 stable vocabulary다.

| Kind | 의미 |
| --- | --- |
| `unknown` | public introspection으로 분류할 수 없음 |
| `string` | string 값 |
| `number` | number 값 |
| `boolean` | boolean 값 |
| `null` | null 값 |
| `literal` | 특정 literal 값 |
| `enum` | 정해진 값 중 하나 |
| `object` | object shape |
| `array` | array element sequence |
| `record` | string key record |
| `union` | 여러 schema 중 하나 |
| `discriminatedUnion` | discriminator field로 구분되는 union |
| `optional` | 값이 생략될 수 있음 |
| `nullable` | null을 받을 수 있음 |
| `any` | 임의 JSON 값을 받을 수 있음 |

새 kind 추가는 minor일 수 있다. 기존 kind 제거, rename, 의미 변경은 breaking
change다.

## SchemaDescription

`SchemaDescription`은 kind보다 자세하지만 schema private AST는 아니다.

```ts
type SchemaDescription = {
  kind: SchemaKind;
  jsonSchema: unknown;
  keys?: readonly string[];
  elementKind?: SchemaKind;
  valueKind?: SchemaKind;
  discriminator?: string;
  allowed?: readonly unknown[];
};
```

필드 의미는 다음과 같다.

| Field | 의미 |
| --- | --- |
| `kind` | stable high-level schema kind |
| `jsonSchema` | JSON-safe schema snapshot. 생성할 수 없으면 `null`일 수 있음 |
| `keys` | object shape에서 알려진 key 목록 |
| `elementKind` | array element의 high-level kind |
| `valueKind` | record value의 high-level kind |
| `discriminator` | discriminated union의 discriminator key |
| `allowed` | literal, enum, discriminated union에서 허용되는 값 |

`jsonSchema`는 interop와 debug hint다. 정확한 출력 형식은 underlying schema
library 버전에 영향을 받을 수 있으므로, 앱의 핵심 분기는 `kind`와 optional
description field를 우선 사용해야 한다.

## Result Families

Schema query result는 모두 `ok` discriminant를 가진다.

```ts
type SchemaQueryResult =
  | { ok: true; path: Pointer; mode: SchemaPathMode; kind: SchemaKind; description: SchemaDescription }
  | { ok: false; code: SchemaErrorCode; reason?: string; pointer: Pointer };
```

`kind`와 `describe`는 같은 실패 shape를 공유하고, 성공 result에서 필요한 field만
반환할 수 있다.

`SchemaErrorCode`는 다음 값이다.

| Code | 의미 |
| --- | --- |
| `invalid_pointer` | path가 JSON Pointer 문법이 아님 |
| `path_not_found` | path에 대응되는 schema slot을 찾을 수 없음 |

## Accepts And Violations

`accepts(path, value, mode)`는 해당 schema slot이 value를 받을 수 있는지
검사한다. 성공하면 `{ ok: true }`를 반환한다.

실패하면 `JSONCapabilityResult`를 반환하며, schema 검증 실패는
`code: "schema_violation"`이어야 한다.

`violations[].path`는 schema-slot 기준 JSON Pointer다. 예를 들어 `/items/0` slot에
object를 넣으려 했고 object 안의 `title`이 실패했다면 violation path는 slot path와
issue path가 합쳐진 pointer여야 한다.

Mutation preflight나 patch execution failure의 violation path는
document-result 기준이다. 즉 patch가 적용된 뒤의 document에서 실패 위치를
가리킨다.

## Schema-slot And Document-result

두 path 기준은 반드시 구분해야 한다.

```txt
schema-slot
|-- "이 주소에 이 값을 넣을 수 있는가?"
`-- accepts(), paste guard, import mapping, form field candidate

document-result
|-- "이 patch가 적용된 결과 document가 유효한가?"
`-- patch(), commit(), canPatch(), duplicate/cut/paste preflight
```

앱은 schema-slot failure를 field-level affordance로 보여줄 수 있고,
document-result failure를 transaction failure로 보여줄 수 있다.

## Breaking Change

다음 변경은 1.0 이후 breaking change다.

- `SchemaPathMode` literal 제거, rename, 의미 변경.
- `SchemaKind` literal 제거, rename, 의미 변경.
- `SchemaDescription.kind` 제거.
- `accepts`가 `JSONCapabilityResult`가 아닌 다른 실패 shape를 반환하도록 변경.
- `schema-slot`과 `document-result` violation path 기준 변경.
- schema query가 state를 변경하도록 변경.
