# zod-crud — Canonical Specification

**Status: 정본 (canonical). 30년 호환 목표. 이 문서가 모든 동작의 단일 진실. 코드·문서·테스트가 충돌하면 이 문서가 이긴다.**

---

## 0. 헌장 (Charter)

zod-crud는 **Zod schema로 보호되는 JSON tree 라이브러리**다. editor 아님, 폼 라이브러리 아님, UI 라이브러리 아님.

### 0.1 절대 원칙 — 깨지 못함

다음 원칙은 30년 호환을 위해 **편의보다 우선한다.**

1. **JSON-Only State** — state·action·change는 100% JSON (ECMA-404). function·Symbol·Date·Map·Set·class instance·undefined 0개. `JSON.parse(JSON.stringify(x))`가 항상 round-trip.
2. **표준 Path 단일 정본** — path 표현은 **RFC 6901 JSON Pointer** 한 가지. 편의 형식(dotted, bracket, array shorthand) 0개.
3. **표준 Operation 단일 정본** — 변경은 **RFC 6902 JSON Patch** 6 op 그대로. 추가 op 0개.
4. **Pure Core** — 모든 mutation은 `(state, op) → { state, result }` 순수함수. side effect 0, instance 0, dispatch 0.
5. **React 의존 = hook 1개** — 코어는 React 없이 동작. hook은 코어 위 어댑터.

위 5개는 라이브러리 정체성이며 후속 결정의 기각 사유로 사용된다.

---

## 1. 표준 의존 (Normative References)

| 표준 | 영역 | 규정력 |
|------|------|--------|
| **RFC 8259 / ECMA-404** — JSON | state·action·change 직렬화 | 절대 |
| **RFC 6901** — JSON Pointer | path 표현 | 절대 |
| **RFC 6902** — JSON Patch | 변경 표현 | 절대 |
| **ECMAScript** | 런타임 | 절대 |
| Zod (semver-major 시 검토) | schema 검증 | 의존 라이브러리 |
| React `>=18` (optional peer) | `useJson` 훅만 의존 | 옵셔널 |

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

### 5.1 `useJson` — React hook (유일한 React 진입점)

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
  patch(operations: JsonPatchOperation[]): JsonResult;

  // history (opt-in)
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;

  // lifecycle
  load(value: T): JsonResult;
  reset(value?: T): void;
}
```

### 5.3 Pure core — `applyPatch` / `applyOperation`

```ts
export function applyOperation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  op: JsonPatchOperation,
): { state: z.output<S>; result: JsonResult };

export function applyPatch<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: JsonPatchOperation[],
): { state: z.output<S>; result: JsonResult };
```

순수함수. React 의존 0. 어떤 환경에서도 import 가능 (서버, Worker, 다른 framework).

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
export function parsePointer(pointer: Pointer): string[];   // 이스케이프 디코드된 segment 배열
export function buildPointer(segments: (string | number)[]): Pointer;
export function escapeSegment(s: string): string;           // ~ → ~0, / → ~1
```

내부 정본은 segment 배열이지만 **외부 API 전체가 Pointer string**이라 사용자는 이 헬퍼 없이도 라이브러리 사용 가능.

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

다음은 **본 라이브러리가 의도적으로 다루지 않는다.** 사용자 layer 또는 별도 패키지의 책임.

- UI 컴포넌트, 렌더링, 스타일
- Form 통합 (`<input name=...>`, validation messages)
- Selection model, focus management, keyboard navigation
- Drag and drop
- Multi-user CRDT, OT, conflict resolution (단, RFC 6902 patch 교환은 지원)
- 네트워크 sync, persistence backend
- Lock / region / dirty tracking (UI 책임)
- Tree-shape 변형 (wrap/unwrap/indent/outdent/split/join — 이것들은 RFC 6902 op 조합으로 사용자가 직접 구성)

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

## 10. 마이그레이션 메모 (현재 → 정본)

기존 코드(`createJsonCrud`, NodeId 모델, locked-region, dirty, focus, select)는 이 정본 시점에서 **제거 대상**. 마이그레이션 wave:

- **Wave 0 (현재)**: `useJson` + Pointer/Patch 기반 표면 신설, pure core 구현
- **Wave 1**: `document/` 9 파일 → `core/doc.ts` 1 파일
- **Wave 2**: `mutate/` 9 파일 → `core/apply/*` (RFC 6902 6 op 파일)
- **Wave 3**: `schema/` 8 파일 → `core/schema.ts` 1 파일
- **Wave 4**: `history/` 7 파일 → `core/history.ts` 1 파일 (JsonPatchOperation 스택)
- **Wave 5**: `clipboard/` 9 파일 제거 (RFC 6902 batch로 표현됨 — 코어 책임 아님)
- **Wave 6**: `createJsonCrud` 제거. public surface가 §5만 남음

목표: 60 파일 / 5069 LOC → 약 15 파일 / 2000 LOC 미만.

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
