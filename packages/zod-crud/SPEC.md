# zod-crud — Canonical Specification

**Status: 정본 (canonical). 30년 호환 목표. 이 문서가 모든 동작의 단일 진실. 코드·문서·테스트가 충돌하면 이 문서가 이긴다.**

---

## 0. 헌장 (Charter)

zod-crud는 **Zod schema로 보호되는 JSON tree 라이브러리 + RFC 표준 위에 구축된 editor abstraction**이다. UI 렌더링·폼 라이브러리·DOM 이벤트는 아니다. tree 위 좌표(selection, focus)는 라이브러리 책임이다.

### 0.1 절대 원칙 — Axis 1 (Data Substrate)

다음 원칙은 30년 호환을 위해 **편의보다 우선한다.** state·action·change·history 는 모두 이 축 위에서 정의된다.

1. **JSON-Only State** — state·action·change는 100% JSON (ECMA-404). function·Symbol·Date·Map·Set·class instance·undefined 0개. `JSON.parse(JSON.stringify(x))`가 항상 round-trip.
2. **표준 Path 단일 정본** — path 표현은 **RFC 6901 JSON Pointer** 한 가지. 편의 형식(dotted, bracket, array shorthand) 0개.
3. **표준 Operation 단일 정본** — 변경은 **RFC 6902 JSON Patch** 6 op 그대로. 추가 op 0개.
4. **Pure Core** — 모든 mutation은 `(state, op) → { state, result, applied }` 순수함수. side effect 0, instance 0, dispatch 0.
5. **코어 데이터 hook = 1개** — Axis 1 코어는 React 없이 동작. React 진입점은 `useJson` 1개. Axis 2 의 부가 hook 들은 별도 sibling.

### 0.2 절대 원칙 — Axis 2 (Editor Abstractions)

Editor에서 쓰이는 tree 좌표는 라이브러리가 표준 어휘로 제공한다. UI 렌더링은 사용자 책임이지만 좌표 모델은 정본화한다.

6. **모든 좌표 = RFC 6901 Pointer** — selection·focus 모두 Pointer. `NodeId` 같은 내부 식별자 0.
7. **모든 좌표 상태 = JSON 직렬화 가능** — selection·focus state 모두 `JSON.stringify` round-trip. (collaborative cursor·SSR hydration·postMessage 무료)
8. **WAI-ARIA 어휘 정합** — selection mode (`single`/`multiple`/`extended`), focus 단일 활성 좌표(`aria-activedescendant` 의미), per-item selected 상태(`aria-selected` 의미). ARIA 패턴(Listbox·Tree·Grid·TreeGrid)에서 정의된 의미만 차용한다.
9. **자동 추적** — RFC 6902 op 적용 시 selection·focus 가 자동으로 추종한다 (이동·제거·삽입 따라 Pointer 갱신·소실). 사용자가 wiring 0.
10. **Axis 2 hook 별도, opt-in** — `useSelection`·`useFocus` 는 별도 hook. 미사용 시 tree-shake 로 비용 0.

위 10개 원칙은 라이브러리 정체성이며 후속 결정의 기각 사유로 사용된다.

---

## 1. 표준 의존 (Normative References)

| 표준 | 영역 | 규정력 |
|------|------|--------|
| **RFC 8259 / ECMA-404** — JSON | state·action·change 직렬화 | 절대 |
| **RFC 6901** — JSON Pointer | path 표현 | 절대 |
| **RFC 6902** — JSON Patch | 변경 표현 | 절대 |
| **ECMAScript** | 런타임 | 절대 |
| Zod (semver-major 시 검토) | schema 검증 | 의존 라이브러리 |
| React `>=18` (optional peer) | React hooks (`useJson`, Axis 2 hooks) | 옵셔널 |

표준 외의 디팩토 관행(lodash dot path, RHF bracket path 등)은 **참조하지 않는다.** 호환 어댑터도 라이브러리 본체에 포함하지 않는다.

---

## 2. Path — RFC 6901 JSON Pointer

### 2.1 형식

```
""              ─ 루트 (state 자체)
"/key"          ─ state.key
"/a/b"          ─ state.a.b
"/tasks/0"      ─ state.tasks[0]
"/tasks/-"      ─ state.tasks의 끝 (add 전용, RFC 6901 §4)
"/users/a~1b"   ─ state.users["a/b"]    (~1 = /)
"/users/a~0b"   ─ state.users["a~b"]    (~0 = ~)
```

### 2.2 규칙 (RFC 6901 §3·§4 그대로)

- 빈 문자열 `""` = 루트
- `/`로 시작 + segment를 `/`로 구분
- 키에 `/`가 있으면 `~1`, `~`가 있으면 `~0`로 이스케이프 (`~0`을 먼저 디코드 — RFC 6901 §4 참조)
- `-` 단독 segment는 array 끝을 의미. **add op 전용** (다른 op에서는 invalid_pointer)
- 그 외 형식 = `invalid_pointer` 에러

### 2.3 타입

```ts
export type Pointer = string;  // RFC 6901
```

빌드 타임 타입 안전을 위한 `PointerOf<T>` 추론 타입을 제공한다 (§5.4 참조).

### 2.4 Array index와 Record key 모호성

JSON Pointer는 segment 형식만 정의하고 의미는 데이터 컨텍스트에 위임한다 (RFC 6901 §4). zod-crud는 schema의 해당 위치 타입으로 결정한다:

- schema가 array → segment를 `parseInt`. 정수 아니면 `invalid_pointer`
- schema가 object → 문자열 key (이스케이프 디코드 후)
- schema가 record → 문자열 key
- 둘 다 가능한 union → `add`/`replace`는 새 값의 schema-fit 우선

---

## 3. Operation — RFC 6902 JSON Patch

### 3.1 6개 op (RFC 6902 §4 그대로)

```ts
export type JsonPatchOperation =
  | { op: "add";     path: Pointer; value: unknown }
  | { op: "remove";  path: Pointer }
  | { op: "replace"; path: Pointer; value: unknown }
  | { op: "move";    from: Pointer; path: Pointer }
  | { op: "copy";    from: Pointer; path: Pointer }
  | { op: "test";    path: Pointer; value: unknown };
```

### 3.2 의미 (RFC 6902 §4 요약)

| op | 의미 | 실패 조건 |
|----|------|-----------|
| `add` | path가 array index면 그 위치 삽입(뒤를 밀어냄), `/-`면 끝에 append, object면 키 생성/덮어쓰기 | path 부모 없음, schema 위반 |
| `remove` | 노드 제거. array면 인덱스 shift | path 존재 안 함, schema 위반 |
| `replace` | 기존 값 교체 (대상 존재 필수) | path 존재 안 함, schema 위반 |
| `move` | from 제거 → path 위치에 add (RFC 6902 §4.4) | from 존재 안 함, path = from 또는 from의 prefix(자기 자손으로 이동), schema 위반 |
| `copy` | from 값 deep clone → path 위치에 add | from 존재 안 함, schema 위반 |
| `test` | path 값이 value와 deep-equal인지 검사. 실패 시 batch 전체 롤백 (§3.4) | 비교 실패 |

### 3.3 추가 op 금지

`set`, `insert`, `delete`, `rename`, `update`, `appendChild`, `paste` 등 편의 alias는 **금지**. RFC 6902에 없는 op는 신설하지 않는다.

표준 6 op 조합으로 표현되는 작업:
- record key rename → `move("/users/old", "/users/new")`
- append → `add("/tasks/-", v)`
- prepend → `add("/tasks/0", v)`
- batch paste → `patch([{ op: "add", ... }, ...])`

### 3.4 Batch — JSON Patch document

```ts
ops.patch(operations: JsonPatchOperation[]): JsonResult;
```

RFC 6902 §3 batch semantics:
- 순차 적용. 한 op이 실패하면 **전체 롤백** (모두 적용 또는 모두 미적용).
- Schema 검증은 **batch 종료 후 1회**. 중간 상태가 schema 위반이어도 최종이 valid면 통과.

---

## 4. State Model

### 4.1 상태 = JSON

```ts
type State<S extends z.ZodType> = z.output<S>;
```

`JsonDoc`/`NodeId`/`nodes by id` 등 내부 표현은 **외부 노출 0**. 사용자는 `state` 자체를 plain JSON으로 받는다.

### 4.2 직렬화 보증 (dev assert)

```ts
function assertSerializable(x: unknown, where: string): void {
  // dev only. function·Symbol·undefined·BigInt·Map·Set·class instance 검출 시 throw
}
```

모든 op의 입력(`value`)과 출력(`state`)에 적용. production 빌드에서는 noop.

### 4.3 reset / load

- `load(value)` — 외부에서 받은 JSON을 schema 검증 후 state로 교체. history는 clear.
- `reset(value?)` — initial 또는 인자 값으로 교체. history clear.

### 4.4 History — opt-in

```ts
useJson(schema, initial, { history: number })  // 0이면 disabled
```

내부 형식: `JsonPatchOperation[]` 스택 (forward + inverse). 표준 형식 그대로 저장하므로 외부 직렬화 무료.

---

## 5. Public API

### 5.1 `useJson` — core data React hook

```ts
export function useJson<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UseJsonOptions,
): [z.output<S>, JsonOps<z.output<S>>];

export interface UseJsonOptions {
  history?: number;     // 기본 0 (disabled)
  strict?: boolean;     // dev=true, prod=false 기본
  onError?: (e: JsonCrudError) => void;
}
```

### 5.2 `JsonOps` — 표준 6 op + lifecycle

```ts
export interface JsonOps<T> {
  // RFC 6902 6 op
  add<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;
  remove<P extends PointerOf<T>>(path: P): JsonResult;
  replace<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;
  move<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JsonResult;
  copy<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JsonResult;
  test<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JsonResult;

  // RFC 6902 batch
  patch(operations: ReadonlyArray<JsonPatchOperation>): JsonResult;

  // history (opt-in)
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;

  // lifecycle
  load(value: T): JsonResult;
  reset(value?: T): void;

  // Axis 2 coordination
  subscribe(listener: JsonChangeListener): () => void;
  readonly state: T;
}

export type JsonChangeListener = (applied: ReadonlyArray<JsonPatchOperation>) => void;
```

### 5.3 Pure core — `applyPatch` / `applyOperation`

```ts
export function applyOperation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  op: JsonPatchOperation,
): ApplyResult<S>;

export function applyPatch<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JsonPatchOperation>,
): ApplyResult<S>;

export interface ApplyResult<S extends z.ZodType> {
  state: z.output<S>;
  result: JsonResult;
  applied: ReadonlyArray<JsonPatchOperation>;
}
```

순수함수. React 의존 0. 어떤 환경에서도 import 가능 (서버, Worker, 다른 framework).

`applied` 는 실제로 commit 된 op 목록. 성공 시 입력 ops 와 동일, 실패 시 빈 배열 (G8 atomicity).
Axis 2 hook 들은 이 배열을 `JsonOps.subscribe` 로 받아 selection·focus 를 자동 추적한다 (§0.2 (9)).

### 5.4 Pointer 타입 추론

```ts
export type PointerOf<T> = ...;        // schema 타입 → 가능한 Pointer 문자열 union
export type ValueAt<T, P extends string> = ...;
```

깊이 한계: 5단. 그 이상은 `string`으로 fallback (TS 컴파일 비용 관리).

### 5.5 직렬화 헬퍼

```ts
export function serialize<T>(state: T): string;          // JSON.stringify thin wrapper
export function parse<S extends z.ZodType>(schema: S, json: string): z.output<S>;
export function safeParse<S extends z.ZodType>(
  schema: S,
  json: string,
): { ok: true; state: z.output<S> } | { ok: false; error: z.ZodError };
```

### 5.6 RFC 6901 Pointer 헬퍼 (low-level)

```ts
// Parse / build
export function parsePointer(pointer: Pointer): string[];          // 이스케이프 디코드된 segment 배열
export function buildPointer(segments: (string | number)[]): Pointer;
export function escapeSegment(s: string): string;                  // ~ → ~0, / → ~1
export function unescapeSegment(s: string): string;

// Path arithmetic (state-free, schema-free)
export function parentPointer(p: Pointer): Pointer | null;         // "/a/b" → "/a", "/a" → "", "" → null
export function lastSegment(p: Pointer): string | null;
export function lastSegmentIndex(p: Pointer): number | null;       // "/tasks/0" → 0, "/tasks/x" → null
export function appendSegment(p: Pointer, seg: string | number): Pointer;
export function withLastSegment(p: Pointer, seg: string | number): Pointer | null;
```

내부 정본은 segment 배열이지만 **외부 API 전체가 Pointer string**이라 사용자는 이 헬퍼 없이도 라이브러리 사용 가능.

Path arithmetic 은 모든 editor 가 공유하는 순수 path 조작. 이 5개 함수가 정본 — 사용자가 split/regex 로 직접 짜는 것을 막는다. **state·schema 모름** 이 핵심 — visible 순회·DFS·child field 같은 navigation order 는 user-defined (각 editor 의 spec 에서 정의).

### 5.6.5 Axis 2 정체성 — focus vs selection

두 좌표는 **단일 차이축**으로 가른다:

| 좌표 | 정체성 | 갯수 | ARIA 매핑 |
|------|--------|------|-----------|
| **`focus`** | 다음 키 입력의 **도착지** (input destination) | 0 또는 1 | `aria-activedescendant` |
| **`selection`** | 다음 명령의 **작용 범위** (command scope) | 0..N | `aria-selected="true"` |

갯수·시점·시각화는 이 차이에서 파생되는 속성이며 별도 정의축이 아니다. 두 좌표는 **독립**이지만, axis 1 mutation 에 대해 **동일한 자동 규칙으로 응답**해야 한다 (그래서 결과적으로 같은 destination 으로 같이 움직이는 경우가 많다).

표준 근거: WAI-ARIA Authoring Practices (Listbox/Tree pattern) 가 정확히 이 두 개념을 분리. Figma·Notion·VSCode·Google Sheets 도 동일.

### 5.7 `useSelection` — Selection state hook (Axis 2)

```ts
export function useSelection<T>(
  ops: JsonOps<T>,
  options?: UseSelectionOptions,
): SelectionState<T>;

export interface UseSelectionOptions {
  mode?: "single" | "multiple" | "extended";  // ARIA Listbox/Tree/Grid 어휘. 기본 "single"
  initial?: ReadonlyArray<Pointer>;
}

export interface SelectionState<T> {
  values: ReadonlyArray<Pointer>;
  anchor: Pointer | null;     // extended 모드의 range 시작점
  focus: Pointer | null;       // extended 모드의 range 끝점 (= 활성 좌표)
  has(pointer: Pointer): boolean;
  set(pointers: ReadonlyArray<Pointer>): void;
  add(pointer: Pointer): void;
  remove(pointer: Pointer): void;
  toggle(pointer: Pointer): void;
  clear(): void;
  range(anchor: Pointer, focus: Pointer): void;  // anchor → focus 사이 모두 선택 (extended)
}
```

**자동 규칙 네 가지** — 사용자 wiring 0. focus 의 두 규칙과 동일 어휘.

1. **Mutation auto-select**: `applied` 안에 `add` / `copy` / `move` 가 있으면 destination 으로
   `set([destination])`. 첫 번째 매치만 사용. `/-` 는 actual index 로 resolve. root replace (`""`) 는 무시.
2. **Lost selection recovery**: selection 의 각 항목이 op 후 사라지면 nextSibling → prevSibling → parent
   순으로 복구한다 (focus rule 2 와 동일 — 항목별로 적용). 다 사라지면 selection 은 `[]`.
3. **Index shift tracking**: 살아남은 항목들의 형제 인덱스가 add/remove 로 밀리면 자동 보정 (`trackPointers`).
4. **Anchor tracking**: extended 모드의 `anchor` 도 같은 규칙으로 추적/복구.

수동 `set/add/remove/toggle/clear/range` 는 위 규칙보다 우선 (사용자 의도 존중).

History 의미: axis 2 단독 변경(`set` 등 직접 호출)은 history 비대상. 단 `useJsonDocument` facade 는 axis 1 dispatch 시점에 selection 스냅샷을 같이 entry 에 캡처해 undo/redo 시 같이 원복한다.

### 5.8 `useFocus` — 단일 활성 좌표 hook (Axis 2)

```ts
export function useFocus<T>(
  ops: JsonOps<T>,
  options?: UseFocusOptions,
): FocusState<T>;

export interface UseFocusOptions {
  initial?: Pointer | null;
}

export interface FocusState<T> {
  value: Pointer | null;       // aria-activedescendant 의미
  set(pointer: Pointer | null): void;
  clear(): void;
}
```

**자동 규칙 두 가지** — 사용자 wiring 0.

1. **Mutation auto-focus**: `applied` 안에 `add` / `copy` / `move` 가 있으면 destination 으로 자동
   포커스 (paste · insert · move · 외부 patch 적용 등). `/-` (append) 는 actual index 로 resolve.
   첫 번째 매치만 사용. root replace (`""`) 는 무시 — load/reset/undo-via-root-replace 의 의미는
   "focus 를 강제하지 않음".
2. **Lost focus recovery**: 현 focus 좌표가 op 후 사라지면 다음 순서로 복구한다.
   1) nextSibling (same parent, same index — remove 시 뒤가 당겨져 그 자리)
   2) prevSibling (`idx - 1`)
   3) parent (root 면 `null`)

수동 `set(pointer)` 은 위 규칙보다 우선한다 (사용자 의도 존중). filter / recover 콜백은 폐기 —
규칙이 일관되어 콜백이 필요 없다.

History 의미: focus 단독 변경은 history 비대상. `useJsonDocument` facade 가 axis 1 dispatch 시점에 focus 스냅샷을 entry 에 같이 캡처해 undo/redo 시 같이 원복한다 (selection 과 동일).

### 5.9 Pointer tracking helpers (Axis 2 low-level)

```ts
export function trackPointer(
  pointer: Pointer,
  applied: ReadonlyArray<JsonPatchOperation>,
): Pointer | null;

export function trackPointers(
  pointers: ReadonlyArray<Pointer>,
  applied: ReadonlyArray<JsonPatchOperation>,
): Pointer[];
```

`useSelection`·`useFocus` 가 사용하는 low-level helper. RFC 6902 op 적용 후
기존 Pointer 가 어디로 이동했는지 계산한다. 제거된 좌표는 `null` 또는 결과
목록에서 제외된다.

---

## 6. 에러 — 시끄러움 4단

### 6.1 단계

| 단계 | 시점 | 잡히는 위반 | 표현 |
|------|------|-------------|------|
| 1. TS 타입 | 빌드 | Pointer 형식, value 타입 불일치 | 컴파일 에러 |
| 2. Pointer parse | dispatch 시작 | RFC 6901 형식 위반 | `invalid_pointer` |
| 3. Path resolve | dispatch 시작 | replace/remove/test 대상 없음, move 자기 자손으로 이동 | `path_not_found` / `move_into_self` |
| 4. Schema validate | dispatch 후 (batch는 끝나고 1회) | Zod 검증 실패 | `schema_violation` |
| 5. Serializability assert | dev only | non-JSON 값 진입 | `not_serializable` (throw) |

### 6.2 `JsonResult`

```ts
export type JsonResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer };

export type ErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "move_into_self"
  | "schema_violation"
  | "test_failed"
  | "not_serializable";
```

### 6.3 strict 모드

- `strict: true` (dev 기본) → 실패 시 `JsonCrudError` throw
- `strict: false` (prod 기본) → `JsonResult` 반환, `onError` 콜백 호출

```ts
export class JsonCrudError extends Error {
  constructor(
    public op: JsonPatchOperation | "load" | "reset" | "patch",
    public result: Extract<JsonResult, { ok: false }>,
  );
}
```

---

## 7. 보장 (Guarantees)

라이브러리는 다음을 **항상** 보장한다. 한 항목이라도 깨지면 버그.

1. **G1 (직렬화)**: `JSON.parse(JSON.stringify(state))` ≡ `state`
2. **G2 (불변)**: op 후 이전 state 객체는 변형되지 않는다
3. **G3 (검증)**: state는 항상 `schema.safeParse(state).success === true`
4. **G4 (RFC 6902 호환)**: `applyPatch` 결과는 다른 RFC 6902 구현과 동일
5. **G5 (Pointer 호환)**: pointer 해석은 RFC 6901과 동일
6. **G6 (Pure)**: `applyOperation`/`applyPatch`는 동일 입력 → 동일 출력. 외부 변수·시간·랜덤 의존 0
7. **G7 (Round-trip)**: history undo→redo는 state 항등 (deep equal)
8. **G8 (Atomicity)**: batch 실패 시 state 미변경

---

## 8. 비-목표 (Non-Goals)

다음은 **본 라이브러리가 의도적으로 다루지 않는다.** 사용자 layer 책임.

- UI 컴포넌트, 렌더링, 스타일, CSS
- Form 통합 (`<input name=...>`, validation messages)
- Keyboard navigation 의 키 매핑 (Shift+Click·Cmd+A 등 의 의미는 §0.2 선언, 키 이벤트 → 의미 매핑은 사용자)
- Drag and drop 의 DOM 이벤트 처리 (drop 시 어떤 op 를 보낼지는 사용자)
- Multi-user CRDT, OT, conflict resolution (단, RFC 6902 patch 교환은 지원)
- 네트워크 sync, persistence backend
- Lock / region / dirty tracking
- Tree-shape 변형 (wrap/unwrap/indent/outdent/split/join — 이것들은 RFC 6902 op 조합으로 사용자가 직접 구성)

## 8.5 라이브러리 책임 (정본 — §0.2)

다음은 **본 라이브러리가 책임진다.** SPEC §0.2 의 Axis 2 헌장에 의해 락인됨.

- Selection model (Pointer 집합, single/multiple/extended 모드, anchor/focus, range 선택)
- Focus model (단일 활성 좌표, filter/recover)
- 좌표 자동 추적 (RFC 6902 op 적용 시 selection·focus 가 추종)
- 직렬화 (모든 좌표 상태가 JSON.stringify round-trip)

---

## 9. 호환성 정책

### 9.1 Public surface

§5에 명시된 항목만 public. 나머지(internal/, core/) import는 사용자 책임.

### 9.2 Semver

- **major**: §0.1 절대 원칙 변경, public API breaking
- **minor**: 새 헬퍼, 새 옵션 (default 보존)
- **patch**: 버그 수정, G1-G8 보장 강화

### 9.3 표준 추적

- RFC 6901·6902가 obsolete 되거나 successor가 나오면 major bump로 따라감
- Zod major 변경은 별도 릴리즈로 검토
- React 최저 버전은 `useSyncExternalStore` 가용성(>=18) 유지

---

## 10. 마이그레이션 — 완료 (2026-05-10)

기존 NodeId 기반 코어(`createJsonCrud`, `document/`, `mutate/`, `schema/`,
`history/`, `clipboard/`, `internal/`, `read/`, `state/`, `dirty.ts`,
`focus.ts`, `locked-region.ts`, `result.ts`, `select.ts`, `subscribe.ts`,
`types.ts`, `validation.ts`)는 **전부 제거됨**. 의존하던 앱
(`apps/showcase`, `apps/nested-ui-lab`, `apps/site`)도 SPEC §8 비-목표
영역이라 함께 제거됨.

현재 `packages/zod-crud/src/` 구조:

```
index.ts              ─ public export (SPEC §5)
useJson.ts            ─ React hook (SPEC §5.1·§5.2)
useSelection.ts       ─ selection hook (SPEC §5.7)
useFocus.ts           ─ focus hook (SPEC §5.8)
core/
  pointer.ts          ─ RFC 6901 (SPEC §5.6)
  path-types.ts       ─ PointerOf<T>·ValueAt<T,P> (SPEC §5.4)
  patch.ts            ─ RFC 6902 pure core (SPEC §5.3)
  serialize.ts        ─ serialize/parse/safeParse (SPEC §5.5)
  track.ts            ─ Pointer tracking for Axis 2 hooks
```

Clipboard abstraction remains an Axis 2 candidate but is not part of the current
public surface until implemented and exported.

향후 SPEC 개정은 ADR(`packages/zod-crud/adr/NNNN-title.md`) 절차를
따른다 (§11).

---

## 11. 분쟁 해결

이 문서와 코드/문서/테스트가 충돌하면:

1. **이 문서가 이긴다.** 코드를 고친다.
2. 이 문서가 RFC와 충돌하면 **RFC가 이긴다.** 이 문서를 고친다.
3. 둘 다 RFC와 일치하나 모호하면 새 ADR을 작성하고 §0.1 원칙으로 판정한다.

ADR 위치: `packages/zod-crud/adr/NNNN-title.md`. 한 번 머지된 ADR은 새 ADR이 supersede 표시 없이 폐기 못 함.

---

**버전**: 1.0.0 (2026-05-10)
**상태**: canonical, locked
**서명**: 사용자 합의 (2026-05-10) — RFC 6901/6902 단일 정본 락인
