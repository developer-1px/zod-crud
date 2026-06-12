# Result and Error Code Contract

상태: 1.0 semantic freeze 기준.

이 문서는 public API가 반환하는 성공, 실패, error code, diagnostic shape를
고정한다. 문서의 목적은 앱이 실패를 문자열로 추측하지 않고, 안정적인 코드와
구조로 처리하게 만드는 것이다.

## 규범

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`는 규범 키워드다.

호환 구현체는 public entrypoint의 result shape와 error code를 이 문서와
동일하게 유지해야 한다. 새 error code 추가는 minor일 수 있지만, 기존 code
제거, 의미 변경, 성공/실패 discriminant 변경은 breaking change다.

## 공통 Result Shape

공개 Result family는 `ok` discriminant를 가져야 한다.

```ts
type Result<T, E> =
  | ({ ok: true } & T)
  | ({ ok: false } & E);
```

성공 result는 API별 payload를 가진다. 실패 result는 stable `code`를 가져야
한다. 사람이 읽는 diagnostic text는 `reason`에 둔다. 일부 clipboard와
structural result는 1.0 migration alias로 같은 값을 `message`에도 보존할 수
있지만, 새 코드와 문서는 `reason`을 우선 읽어야 한다. 정확한 문구를 프로그램
분기에 사용하면 안 된다.

## JSONResult

`JSONResult`는 low-level JSON Patch 실행의 최소 계약이다.

```ts
type JSONResult =
  | { ok: true }
  | {
      ok: false;
      code: ErrorCode;
      reason?: string;
      pointer?: Pointer;
    };
```

`pointer`는 실패와 직접 관련된 JSON Pointer다. 실패가 전체 문서, clipboard,
schema 전체, 또는 pointer 없는 작업에 속하면 없을 수 있다.

`ErrorCode`는 다음 값으로 고정된다.

| Code | 의미 |
| --- | --- |
| `invalid_pointer` | JSON Pointer 문법이 잘못됨 |
| `path_not_found` | 주소는 문법적으로 맞지만 대상이 없음 |
| `move_into_self` | subtree를 자기 자신 아래로 move하려 함 |
| `schema_violation` | 결과 document나 입력 값이 schema를 통과하지 못함 |
| `test_failed` | JSON Patch `test` operation 실패 |
| `not_serializable` | public JSON boundary에서 JSON 값이 아닌 입력을 만남 |

## JSONCapabilityResult

`JSONCapabilityResult`는 `can*` 계열과 schema capability가 쓰는 실패 계약이다.

```ts
type JSONCapabilityResult =
  | { ok: true }
  | {
      ok: false;
      code: CapabilityErrorCode;
      reason?: string;
      pointer?: Pointer;
      violations?: readonly CapabilityViolation[];
    };
```

`can*` result는 state를 바꾸지 않아야 한다. boolean으로 축약하면 안 되며,
실패한 이유를 stable `code`로 제공해야 한다.

`CapabilityErrorCode`는 `ErrorCode`에 다음 값을 더한 집합이다.

| Code | 의미 |
| --- | --- |
| `preflight_failed` | patch 미리 검증 단계에서 실패함 |
| `discriminator_mismatch` | discriminated union target과 payload가 맞지 않음 |
| `rekey_failed` | duplicate/paste 중 key 재생성 실패 |
| `missing_new_key` | key가 필요한 작업에 새 key가 없음 |
| `key_conflict` | 새 key가 이미 존재함 |
| `empty_selection` | selection이 필요한 작업에 selection이 없음 |
| `empty_scope` | 탐색, 검색, cursor scope가 비어 있음 |
| `empty_match` | 검색 또는 replace 대상 match가 없음 |
| `cursor_boundary` | cursor가 더 이동할 수 없는 경계에 있음 |
| `syntax_error` | query, pointer, search pattern 등의 문법 오류 |
| `empty_stack` | undo/redo stack이 비어 있음 |
| `apply_failed` | preview나 capability가 실제 적용 경로에서 실패함 |
| `empty_clipboard` | paste할 headless clipboard payload가 없음 |

Selection text editing은 selection order code에 다음 값을 더할 수 있다.

| Code | 의미 |
| --- | --- |
| `missing_length` | string range offset 계산에 필요한 길이가 없음 |
| `multi_pointer_range` | 하나의 text edit range가 여러 pointer를 가로지름 |
| `overlapping_ranges` | text replacement range들이 겹침 |
| `not_string` | text edit target이 string 값이 아님 |
| `point_not_in_order` | selection point를 traversal order에서 찾을 수 없음 |

## CapabilityViolation

`violations`는 schema 실패를 기계적으로 표시하는 배열이다.

```ts
type CapabilityViolation = {
  path: string;
  message: string;
};
```

`violations[].path`는 JSON Pointer 문자열이어야 한다. `message`는 사람이 읽는
diagnostic이며, 정확한 문구는 stable contract가 아니다.

Schema capability의 violation path는 검사한 schema slot을 기준으로 한다.
Patch execution이나 mutation preflight의 violation path는 patch를 적용한 뒤의
document result를 기준으로 한다. 이 구분은 각각 `schema-slot`,
`document-result`라고 부른다.

## Clipboard And Structural Result Families

Clipboard와 structural command result는 `ok` discriminant를 공유하지만 API별
성공 payload를 가진다.

| Family | 성공 payload |
| --- | --- |
| read/query/entries | 읽은 값 또는 pointer 목록 |
| copy | clipboard `payload`, source pointer |
| cut | next `value`, `applied`, clipboard `payload`, source pointer |
| paste | next `value`, `applied` |
| duplicate | next `value`, `applied`, `duplicatedTo` |
| undo/redo | top-level document command는 `JSONCapabilityResult` |

Clipboard family와 structural result의 실패 diagnostic field는 `reason`이다.
Stable branch key는 `code`다.

`discriminator_mismatch`는 추가 정보를 제공한다.

```ts
type DiscriminatorMismatch = {
  ok: false;
  code: "discriminator_mismatch";
  reason: string;
  source: { discriminator: string; value: unknown };
  expected: { discriminator: string; allowed: unknown[] };
};
```

앱은 이 payload로 paste target 선택, type conversion prompt, import review UI를
만들 수 있다. Core는 그 UI를 소유하지 않는다.

## Applied Patch Contract

성공 mutation result의 `applied`는 실제 commit된 JSON Patch operation 배열이다.

Capability나 preview 계열이 `applied`를 제공하는 경우에는 같은 execution path로
commit될 operation을 의미해야 한다. 실패 result는 partial `applied`를 공개하면
안 된다.

## Throwing Boundary

Document execution method의 strict 실패는 `JSONDocumentError`를 throw할 수 있다.
Non-strict 실패는 result object를 반환해야 한다.

기본값은 `strict: false`다. `strict: true`를 명시한 caller만 throw boundary를
선택한다.

Top-level `doc.undo()`와 `doc.redo()`는 boolean이 아니라 `JSONCapabilityResult`를
반환해야 한다. `doc.history.undo()`와 `doc.history.redo()` 같은 lower-level
history control은 boolean일 수 있지만 command facade의 Result 계약을 대체하지
않는다.

`JSONDocumentError`도 stable `code`와 optional diagnostic을 보존해야 한다. 앱은
throw 여부가 아니라 result contract의 `code`로 실패를 분류해야 한다.

## Breaking Change

다음 변경은 1.0 이후 breaking change다.

- `ok` discriminant 제거 또는 의미 변경.
- 기존 error code 제거, rename, 의미 변경.
- 실패 result의 `code` 제거.
- `violations[].path`를 JSON Pointer가 아닌 형식으로 변경.
- `schema-slot`과 `document-result` violation path 기준 변경.
- 성공 mutation result에서 `applied` 의미를 실제 commit patch가 아닌 것으로 변경.

다음 변경은 호환 가능한 확장일 수 있다.

- 새 error code 추가.
- 실패 result에 optional diagnostic field 추가.
- 성공 result에 optional metadata 추가.
