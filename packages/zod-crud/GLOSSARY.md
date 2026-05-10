# GLOSSARY — zod-crud 도메인 딕셔너리

이 문서는 zod-crud 의 단일 어휘 SSOT 다. 새 용어를 도입할 때 여기에 등재하고,
SPEC.md 또는 RFC 조항으로 정의를 박는다. 알파벳·기호·한글 순.

---

## A

### `add` (RFC 6902 §4.1)
RFC 6902 op 중 하나. object key 생성 또는 array 위치 삽입. `path` 가 array index 면
그 위치 삽입(뒤를 밀어냄), `/-` 면 끝에 append, object 면 키 생성/덮어쓰기.

### `anchor` (selection)
Selection 에서 range 의 시작 좌표. Pointer. DOM Selection API 의 anchor 와 동일 의미.
SPEC §5.7.

### `applied` (ApplyResult 필드)
`applyOperation` / `applyPatch` 가 반환하는 `JsonPatchOperation[]`. 실제로 commit 된
op 목록. 성공 시 입력 ops 와 동일, 실패 시 빈 배열 (G8). Axis 2 hook 들이 이 배열을
보고 좌표를 자동 추적한다. SPEC §5.3.

### `applyOperation` / `applyPatch`
순수함수 코어. `(schema, state, op|ops) → { state, result, applied }`. React 의존 0,
어디서나 import 가능. SPEC §5.3.

### `aria-activedescendant`
WAI-ARIA 속성. 가상 활성 좌표를 나타냄. `useFocus` value 가 가리키는 의미.
SPEC §0.2 (8).

### `aria-multiselectable`
WAI-ARIA 속성. `useSelection` mode `single` ↔ `false`, `multiple`/`extended` ↔ `true`.
ADR 0001.

### `aria-selected`
WAI-ARIA 속성. item 별 selection 여부. `selection.has(p)` 의 의미. ADR 0001.

### Axis 1 (Data Substrate)
zod-crud 헌장의 첫 번째 30년 축. RFC 6901 + RFC 6902 + JSON 직렬화 + pure core +
React 진입점 단일 (`useJson`). SPEC §0.1.

### Axis 2 (Editor Abstractions)
zod-crud 헌장의 두 번째 30년 축. Pointer 위에 짓는 selection · focus, WAI-ARIA 어휘
정합, 자동 추적, opt-in hook. SPEC §0.2.

## B

### `buildPointer(segments)`
RFC 6901 헬퍼. segment 배열을 Pointer 문자열로 변환 (이스케이프 자동). SPEC §5.6.

## C

### canonical
SPEC.md 의 status. 코드·문서·테스트가 충돌하면 SPEC.md 가 이긴다.

### `copy` (RFC 6902 §4.5)
RFC 6902 op. `from` 값 deep clone → `path` 위치에 add.

## E

### `escapeSegment(s)`
RFC 6901 헬퍼. `~` → `~0`, `/` → `~1` 이스케이프. SPEC §5.6.

### `extended` (selection mode)
Selection mode 중 하나. anchor + focus 로 range 선택 + 다중 토글 모두 허용.
ARIA Listbox/Tree/Grid extended pattern. SPEC §5.7.

## F

### focus (Axis 2)
단일 활성 좌표. Pointer | null. `useFocus` 가 관리. `aria-activedescendant` 의미.
SPEC §5.8.

## G

### G1 — 직렬화
`JSON.parse(JSON.stringify(state)) ≡ state`. SPEC §7.

### G2 — 불변
op 후 이전 state 객체는 변형되지 않는다. SPEC §7.

### G3 — 검증
state 는 항상 `schema.safeParse(state).success === true`. SPEC §7.

### G4 — RFC 6902 호환
`applyPatch` 결과는 다른 RFC 6902 구현과 동일. SPEC §7.

### G5 — Pointer 호환
pointer 해석은 RFC 6901 과 동일. SPEC §7.

### G6 — Pure
`applyOperation`/`applyPatch` 는 동일 입력 → 동일 출력. 외부 변수·시간·랜덤 의존 0.
SPEC §7.

### G7 — Round-trip
history undo→redo 는 state 항등 (deep equal). SPEC §7.

### G8 — Atomicity
batch 실패 시 state 미변경. SPEC §7.

## J

### JSON Patch (RFC 6902)
변경 표현의 단일 정본. 6 op (add, remove, replace, move, copy, test) 외 추가 0개.
SPEC §0.1 (3) · §3.

### JSON Pointer (RFC 6901)
path 표현의 단일 정본. dotted/bracket/array shorthand 0개. SPEC §0.1 (2) · §2.

### `JsonChangeListener`
`(applied: ReadonlyArray<JsonPatchOperation>) => void`. `JsonOps.subscribe` 의 콜백
타입. Axis 2 hook 들이 op 적용을 받기 위해 사용. SPEC §5.2.

### `JsonCrudError`
strict 모드에서 throw 되는 에러 클래스. `op` 와 `result` 필드 노출. SPEC §6.3.

### `JsonOps<T>`
`useJson` 의 두 번째 반환값. RFC 6902 6 op + patch + history + lifecycle +
subscribe + state. SPEC §5.2.

### `JsonPatchOperation`
RFC 6902 op 의 TS discriminated union. `op` 필드로 구분. SPEC §3.1.

### `JsonResult`
op 결과. `{ ok: true } | { ok: false, code, reason?, pointer? }`. SPEC §6.2.

## L

### `load(value)`
`JsonOps` 메서드. 외부에서 받은 JSON 을 schema 검증 후 state 로 교체. history clear.
SPEC §4.3.

## M

### `move` (RFC 6902 §4.4)
RFC 6902 op. `from` 제거 → `path` 위치에 add. record key rename 도 `move` 로 표현.

### `move_into_self`
ErrorCode. `path` 가 `from` 의 자손이면 발생.

### `multiple` (selection mode)
Selection mode. 여러 좌표 동시 선택 허용. `aria-multiselectable="true"`. SPEC §5.7.

## P

### `parse(schema, json)`
직렬화 헬퍼. `schema.parse(JSON.parse(json))` 의 thin wrapper. SPEC §5.5.

### `parsePointer(pointer)`
RFC 6901 헬퍼. Pointer 문자열을 이스케이프 디코드된 segment 배열로 변환. SPEC §5.6.

### `path_not_found`
ErrorCode. replace/remove/test 의 대상이 없을 때.

### `patch(operations)`
`JsonOps` 메서드. RFC 6902 batch. atomic — 한 op 실패 시 전체 롤백. Schema 검증은
끝에서 1회. SPEC §3.4 · §5.2.

### Pointer
RFC 6901 JSON Pointer 문자열. zod-crud 의 path 정본. `string` 타입의 별칭. SPEC §2.

### `PointerOf<T>`
빌드 타임 타입 추론. schema 타입 T 에서 가능한 RFC 6901 Pointer 문자열 union 을
도출. 깊이 한계 5단. SPEC §5.4.

### `PointerSyntaxError`
RFC 6901 형식 위반 시 `parsePointer` 가 throw 하는 에러.

### Pure core
side effect 0, instance 0, dispatch 0 의 순수함수 코어. `applyOperation`,
`applyPatch`. SPEC §0.1 (4).

## R

### `recover` (focus option)
`useFocus` 옵션. focus 가 가리키던 좌표가 op 로 사라질 때 다음 위치를 계산하는
콜백 `(state, removed) => Pointer | null`. SPEC §5.8.

### `remove` (RFC 6902 §4.2)
RFC 6902 op. 노드 제거. array 면 인덱스 shift.

### `replace` (RFC 6902 §4.3)
RFC 6902 op. 기존 값 교체 (대상 존재 필수).

### `reset(value?)`
`JsonOps` 메서드. initial 또는 인자 값으로 state 교체. history clear. SPEC §4.3.

## S

### `safeParse(schema, json)`
직렬화 헬퍼. throw 대신 `{ ok, state } | { ok: false, error }` 반환. SPEC §5.5.

### `schema_violation`
ErrorCode. Zod 검증 실패.

### selection (Axis 2)
좌표 집합. `useSelection` 이 관리. mode 에 따라 single/multiple/extended.
SPEC §5.7.

### `serialize(state)`
`JSON.stringify` thin wrapper. SPEC §5.5.

### `single` (selection mode)
Selection mode 기본값. 단일 좌표만. `aria-multiselectable="false"`. SPEC §5.7.

### SPEC.md
canonical specification. 코드·문서·테스트가 충돌하면 이긴다. RFC 락인 + 헌장 +
public surface + 보장 + 비-목표.

### `state` (JsonOps 필드)
read-only 현재 state snapshot. Axis 2 hook 의 filter/recover 콜백에서 사용.
SPEC §5.2.

### strict (옵션)
`UseJsonOptions.strict`. true 면 위반 시 `JsonCrudError` throw, false 면
`JsonResult` 반환. dev 기본 true, prod 기본 false. SPEC §6.3.

### `subscribe(listener)`
`JsonOps` 메서드. op 적용 알림 구독. Axis 2 hook 들이 사용. SPEC §0.2 (9) · §5.2.

## T

### `test` (RFC 6902 §4.6)
RFC 6902 op. `path` 값이 `value` 와 deep-equal 인지 검사. 실패 시 batch 전체 롤백.

### `test_failed`
ErrorCode. test op 의 deep-equal 비교 실패.

### `trackPointer(pointer, applied)` / `trackPointers(pointers, applied)`
RFC 6902 op 적용 시 pointer 좌표 변환. Axis 2 자동 추적의 코어. SPEC §0.2 (9).

## U

### `unescapeSegment(s)`
RFC 6901 헬퍼. `~1` → `/`, `~0` → `~` 디코드. SPEC §5.6.

### `useFocus(ops, options?)`
Axis 2 hook. 단일 활성 좌표 관리. filter/recover 콜백 지원. SPEC §5.8.

### `useJson(schema, initial, options?)`
Axis 1 의 React 진입점. 코어 데이터 hook. SPEC §5.1.

### `useSelection(ops, options?)`
Axis 2 hook. Pointer 집합 관리. single/multiple/extended 모드. SPEC §5.7.

## V

### `ValueAt<T, P>`
빌드 타임 타입 추론. T 에서 Pointer P 가 가리키는 값의 타입. SPEC §5.4.

## W

### WAI-ARIA APG
W3C Authoring Practices. Listbox · Tree · Grid · TreeGrid 패턴이 zod-crud Axis 2
어휘의 정본. SPEC §0.2 (8).

## /-

### `/-` (RFC 6901 §4)
array 끝을 가리키는 segment. `add` op 전용. 다른 op 에서는 `invalid_pointer`.
SPEC §2.2.

## ~0 / ~1

### `~0` / `~1` (RFC 6901 §3)
segment 이스케이프. `~0` = `~`, `~1` = `/`. 디코드 시 `~0` 을 먼저 처리.
SPEC §2.2.

---

## 의도적으로 등재하지 않는 어휘

다음은 SPEC §3.3 / §8 에 의해 라이브러리 어휘에서 **금지**된다. 사용자 코드가
이 단어를 도입하려 하면 RFC 6902 6 op 조합으로 환원할 것:

- `set` / `update` → `replace` (기존 키) 또는 `add` (새 키)
- `insert` / `appendChild` → `add`
- `delete` → `remove`
- `rename` → `move` (record key)
- `paste` → `add` 또는 `move` 의 batch
- `clipboard` → 라이브러리 책임 아님 (사용자 layer)
- `NodeId` / `JsonDoc` → 옛 어휘. 절대 부활 금지

---

**버전**: 1.0.0 (2026-05-10)
**유지 정책**: Stop 훅의 `domain-dictionary-reminder` 가 매 턴 갱신을 강제한다. 새
용어 도입·SPEC 조항 변경 시 반드시 이 파일도 함께 갱신한다.
