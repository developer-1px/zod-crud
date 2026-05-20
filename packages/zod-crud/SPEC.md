# zod-crud — Canonical Specification

**Status: living specification. 현재 코드 동작이 정본이며, 이 문서는 그 동작을 설명한다. 코드·문서·테스트가 충돌하면 먼저 코드 동작을 확인하고 문서를 갱신한다.**

---

## 0. 헌장 (Charter)

### 0.0 정체성 (정본 한 줄)

zod-crud 의 비전은 **모든 FE 편집은 JSON 편집이다** 이다. zod-crud 는 FE 서비스가 매번 다시 만드는 편집 어휘
(select / move / cut / copy / paste / duplicate / undo / redo / find / replace) 를 JSON 표준
(RFC 6901 Pointer · 6902 Patch · 9535 JSONPath · W3C Selection · RFC 8927+Zod) 과 매핑하여
재사용 가능한 표준 레이어로 정립한 headless JSON editing engine 이다.

UI 렌더링 · 폼 라이브러리 · DOM 이벤트 · 키보드 매핑 · system clipboard 호출 · 시각적 selection 표시는 본체가 아니다. JSON 데이터 편집만 본체.

### 0.1 4대 기둥 ↔ 10 verbs ↔ RFC 매핑 (closure 검증 표)

10 verbs 가 4대 기둥 위에 닫힌다 (closure). 새 verb 후보가 등장하면 이 표 어느 칸에 귀속되는지로 본체 진입 여부를 판정한다.

| 기둥 | verbs | RFC/표준 substrate |
|------|-------|---------------------|
| **Selection** (어디) | select, find | RFC 6901 + W3C Selection / RFC 9535 |
| **Edit** (뭐를) | move, duplicate, replace | RFC 6902 (move/copy/replace op + 합성) |
| **Clipboard** (외부 round-trip) | cut, copy, paste | RFC 6902 (remove/add) + RFC 8259 fragment 직렬화 |
| **Undo** (되돌림) | undo, redo | RFC 6902 inverse + history stack |

= 2 + 3 + 3 + 2 = **10 verbs**.

합성 동사 (cut = copy⊗remove, replace = find⊗patch, duplicate = copy⊗paste) 는 **결과 기둥** 에 귀속. 합성 별도 행 두지 않는다 (표가 흐려짐).

### 0.2 코드 위계 — 4-layer + sidecars

```
hooks/      React-only. React API 의존 (useState/useMemo/useRef/MutableRefObject).
            useJSONDocument facade 와 low-level hooks/useJSON, useSelection,
            useJSONSlice, useDraft/useField, React-context wiring helpers
            (buildJSONDocumentOps, jsonDocumentHistory).
   │ uses
commands/   facade builders (pure). buildCommands → Commands<T> (10 verb namespace),
   │ uses   buildCan → Can<T> (preFlight 가드 namespace). React 무관.
verbs/      편집 어휘 composer (pure, React 무관). 1 파일 1 동사 = 10 verbs.
   │ uses   verbs 끼리 import 금지 — 합성은 commands/ 또는 hooks/ 에서.
core/       RFC 표준 substrate (pure). 1 substrate = 1 단위 (폴더 또는 파일).
   │       multi-file: pointer/, patch/, jsonpath/, selection/, schema/.
   │       single-file: history.ts, track.ts (derived substrate).

src/JSONCrudError.ts  useJSON 의 throwable wrap. boundary error 어휘 (public API).
sidecars/   횡단 관심사 — 어떤 layer 에도 속하지 않음. 본체 데이터 흐름에 수평으로 hook.
            recorder (commit stream 직렬화) / debug-log (trace) / http (RFC wire 변환).
```

**의존 방향 (단방향):**
- `core/*` → 외부 의존 0 (단 `core/schema/` 만 Zod 의존 허용)
- `verbs/*` → `core/*` 만 의존. **verbs 끼리 import 금지 (lint rule, type-only 예외)**
- `commands/*` → `verbs/*` + `core/*` + `hooks/useJSON` 의 type 만 의존. React 의존 0.
- `hooks/*` → `commands/*` + `verbs/*` + `core/*` + `JSONCrudError` + React API.
- `sidecars/*` → 자유. 단 위 layer 가 sidecars 에 의존 금지

**`hooks/` 엄격 정합:** React API 의존이 없는 pure 모듈은 `hooks/` 에 두지 않는다. 사용처 (useJSONDocument 가 import) 를 따르지 말고, **모듈 자신의 React 의존 여부** 가 위치 결정 기준.

### 0.3 절대 원칙 (10개)

다음 원칙은 30년 호환을 위해 편의보다 우선한다.

1. **JSON-Only State** — state · action · change 는 100% JSON (ECMA-404). function · Symbol · Date · Map · Set · class instance · undefined 0개. `JSON.parse(JSON.stringify(x))` 가 항상 round-trip.
2. **표준 Path 단일 정본** — path 표현은 **RFC 6901 JSON Pointer** 한 가지. 단 query 어휘는 **RFC 9535 JSONPath** (Pointer 의 query 표현 확장). 편의 형식 (dotted · bracket · array shorthand) 0개.
3. **표준 Operation 단일 정본** — 변경은 **RFC 6902 JSON Patch** 6 op 그대로. 추가 op 0개.
4. **Pure Core** — 모든 mutation 은 `(state, op) → { state, result, applied }` 순수함수. side effect 0, instance 0, dispatch 0.
5. **모든 구조 좌표 = RFC 6901 Pointer** — JSON 데이터 위치는 Pointer. caret/range 는 `JSONPoint` (`Pointer` + offset/edge/affinity) 로 확장한다. JSONPath query 결과는 `Pointer[]` 로 환원.
6. **모든 좌표 상태 = JSON 직렬화 가능** — selection state `JSON.stringify` round-trip. collaborative cursor · SSR hydration · postMessage 무료.
7. **WAI-ARIA 어휘 정합** — selection mode (`single`/`multiple`/`extended`), per-item selected 상태 (`aria-selected` 의미). ARIA 패턴 (Listbox · Tree · Grid · TreeGrid) 에서 정의된 의미만 차용한다.
8. **자동 추적** — RFC 6902 op 적용 시 selection 이 자동 추종 (이동 · 제거 · 삽입 따라 Pointer 갱신 · 소실). 사용자 wiring 0.
9. **Schema mandatory** — `useJSONDocument(schema, initial)` / `createJSONDocument(schema, initial)` 에서 schema 는 required. 모든 mutating verb 는 `core/schema/preFlight` gate 를 통과한다 (branch-only 검증). cross-field refinement 는 보호 밖 (사용자 책임).
10. **공통 facade** — 루트 `zod-crud` 의 `createJSONDocument` 와 `zod-crud/react` 의 `useJSONDocument` 가 같은 document surface 를 제공한다. React 전용 low-level hook 은 `zod-crud/react` 에만 둔다.

### 0.4 Boundary

**JSON 데이터 편집만 본체.** 다음은 본체 밖이다 — 사용자 책임:

- `navigator.clipboard.read/write` 호출 (`doc.clipboard` 는 headless JSON buffer 만 소유)
- DOM 이벤트 → verb 매핑 (Cmd+C / Cmd+V 등)
- 시각적 selection rendering · ARIA 자동 부여
- 키보드 매핑 / IME composition / DnD / folding

### 0.5 Layer 규약

- `verbs/*` — 명시 인자만 받는 pure 함수. selection 자동 사용 금지.
- `hooks/useJSONDocument` / `createJSONDocument` — value, ops, selection, clipboard, history, commands, can 을 한 객체로 묶는 facade. clipboard/move/replace command 는 명시 pointer/payload 인자를 받으며, UI selection 을 command 인자로 바꾸는 일은 사용자 layer 책임.
- `verbs/*` 끼리 import 금지. 합성은 facade (`useJSONDocument`) 에서만.

위 10개 원칙 + boundary + layer 규약은 라이브러리 정체성이며 후속 결정의 기각 사유로 사용된다.

---

## 1. 표준 의존 (Normative References)

| 표준 | 영역 | 규정력 |
|------|------|--------|
| **RFC 8259 / ECMA-404** — JSON | state·action·change 직렬화 | 절대 |
| **RFC 6901** — JSON Pointer (§6 URI fragment 포함) | path 표현 | 절대 |
| **RFC 6902** — JSON Patch (conformance suite 100%) | 변경 표현 | 절대 |
| **RFC 5789** — HTTP PATCH method | 서버 통신 | 옵셔널 (http.ts) |
| **RFC 7396** — JSON Merge Patch | merge 의미 | 옵셔널 (http.ts) |
| **JSON Schema draft-2020-12** | 외부 스펙 다리 | 옵셔널 (core/schema/bridge.ts) |
| **RFC 9535** — JSONPath | find/replace query 어휘 | 절대 (core/jsonpath/) |
| **WAI-ARIA** Listbox/Tree/Grid | selection 어휘 | 절대 |
| **ECMAScript** | 런타임 | 절대 |
| Zod 4 (semver-major 시 검토) | schema 검증 + JSON Schema 양방향 | 의존 라이브러리 |
| React `>=18` (optional peer) | `zod-crud/react` hooks (`useJSONDocument`) | 옵셔널 |

표준 외의 디팩토 관행(lodash dot path, RHF bracket path 등)은 **참조하지 않는다.** 호환 어댑터도 라이브러리 본체에 포함하지 않는다.

### 1.1 JSON Schema 양방향 (외부 표준 다리)

[`src/core/schema/bridge.ts`](https://github.com/developer-1px/zod-crud/tree/main/packages/zod-crud/src/core/schema/bridge.ts) 가 zod 4 의 `toJSONSchema` / `fromJSONSchema` 를 re-export 한다. 외부 도구 (Ajv · OpenAPI · AsyncAPI · 코드젠) 가 받는 표면이 JSON Schema (draft-2020-12) 이므로 이 다리 없으면 우리 schema 가 zod 안에 갇힌다.

```ts
import { toJSONSchema, fromJSONSchema } from "zod-crud";

const jsonSchema = toJSONSchema(myZodSchema);          // → JSON Schema draft-2020-12
const restoredZod = fromJSONSchema(jsonSchemaFromAPI); // ← 서버 스펙 → 클라 검증
```

테스트: [`tests/schema-bridge.test.ts`](https://github.com/developer-1px/zod-crud/tree/main/packages/zod-crud/tests/schema-bridge.test.ts) — round-trip 후 substrate 가 변환된 schema 로 mutation 검증까지 통과.

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

### 2.5 URI fragment 표현 (RFC 6901 §6)

다른 표준 (JSON Schema `$ref`, JSON Reference) 이 Pointer 를 fragment 형식 (`#/foo/bar`) 으로 사용한다. zod-crud 는 양 표현 모두 받는다:

| 형식 | 예시 | 용례 |
|------|------|------|
| JSON String (default) | `/a/b` | 라이브러리 내부, RFC 6902 ops, 사용자 코드 |
| URI Fragment | `#/a/b` | 외부 RFC ($ref), URL fragment, OpenAPI |

- `parsePointer` 가 `#` 시작도 자동 인식 — fragment 안의 percent-encoding 디코드.
- `buildPointer(segs, { uriFragment: true })` 로 fragment 표현 생성 — RFC 3986 unsafe 문자 percent-encode.
- 두 표현은 같은 segment 배열로 round-trip.

테스트: [`tests/rfc6901-uri-fragment.test.ts`](https://github.com/developer-1px/zod-crud/tree/main/packages/zod-crud/tests/rfc6901-uri-fragment.test.ts).

---

## 3. Operation — RFC 6902 JSON Patch

### 3.1 6개 op (RFC 6902 §4 그대로)

```ts
export type JSONPatchOperation =
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
ops.patch(operations: JSONPatchOperation[]): JSONResult;
```

RFC 6902 §3 batch semantics:
- 순차 적용. 한 op이 실패하면 **전체 롤백** (모두 적용 또는 모두 미적용).
- Schema 검증은 **batch 종료 후 1회**. 중간 상태가 schema 위반이어도 최종이 valid면 통과.

### 3.5 Conformance — RFC 6902 인증

[`github.com/json-patch/json-patch-tests`](https://github.com/json-patch/json-patch-tests) 의 표준 suite (`tests.json` + `spec_tests.json`, 합계 112 케이스, 그중 4 케이스는 suite 자체에서 disabled) 를 vendor 해 매 빌드에 자동 검증한다.

- 정본 위치: [`tests/conformance/`](https://github.com/developer-1px/zod-crud/tree/main/packages/zod-crud/tests/conformance/)
- Runner: [`tests/rfc6902-conformance.test.ts`](https://github.com/developer-1px/zod-crud/tree/main/packages/zod-crud/tests/rfc6902-conformance.test.ts)
- 통과율: **159 / 159 (100%)** — 활성 케이스 전부.
- CI 가 실패 시 main 보호.

이 인증이 \"RFC 6902 따른다\" 의 사실상 게이트 — fast-json-patch · jsondiffpatch · rfc6902 등 주류 라이브러리의 채택 기준과 동일.

---

## 4. State Model

### 4.1 상태 = JSON

```ts
type State<S extends z.ZodType> = z.output<S>;
```

별도 내부 문서 표현은 **외부 노출 0**. 사용자는 `state` 자체를 plain JSON으로 받는다.

### 4.2 직렬화 보증

```ts
function assertSerializable(x: unknown, where: string): JSONResult;
```

모든 op의 입력(`value`)과 출력(`state`)에 적용. function·Symbol·undefined·BigInt·Map·Set·class instance·Date·NaN·Infinity·순환 참조·sparse array 는 JSON 이 아니므로 `not_serializable` 로 거부한다. production 빌드에서도 noop 이 아니다.

### 4.3 reset / load

- `load(value, options?)` — 외부에서 받은 JSON을 schema 검증 후 state로 교체. `useJSONDocument` 에서는 성공 시 기본적으로 history 를 비우며, `{ preserveHistory: true }` 를 넘기면 기존 history 를 유지한다. 실패 시 state 와 history 를 모두 유지한다.
- `reset(value?)` — initial 또는 인자 값으로 교체. 성공 시 history 를 비운다. 실패 시 state 와 history 를 모두 유지한다.

### 4.4 History — `JSONDocument` facade owner

History 는 `JSONDocument` facade 가 owner 다. headless `createJSONDocument` 와 React `useJSONDocument` 가
같은 표면을 제공한다. `useJSON` 는 RFC 6902 ops 와 lifecycle 만 제공하고,
undo/redo stack 은 `JSONDocument.history` 와 `JSONDocument.commands.undo/redo` 에서 다룬다.

내부 형식: `JSONPatchOperation[]` forward/inverse stack. 표준 형식 그대로 저장하므로 외부 직렬화 무료.

---

## 5. Public API

### 5.1 `useJSON` — core data React hook

```ts
export function useJSON<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UseJSONOptions,
): [z.output<S>, JSONOps<z.output<S>>];

export interface UseJSONOptions {
  strict?: boolean;     // dev=true, prod=false 기본
  onError?: (e: JSONCrudError) => void;
}
```

### 5.2 `JSONOps` — 표준 6 op + lifecycle

```ts
export interface JSONOps<T> {
  // RFC 6902 6 op
  add<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;
  remove<P extends PointerOf<T>>(path: P): JSONResult;
  replace<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;
  move<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JSONResult;
  copy<F extends PointerOf<T>, P extends PointerOf<T>>(from: F, path: P): JSONResult;
  test<P extends PointerOf<T>>(path: P, value: ValueAt<T, P>): JSONResult;

  // RFC 6902 batch
  patch(operations: ReadonlyArray<JSONPatchOperation>): JSONResult;
  apply(operations: ReadonlyArray<JSONPatchOperation>): void;

  // sugar: add/replace/remove 를 idempotent 하게 합성. RFC 6902 op 는 아님.
  set<P extends PointerOf<T>>(path: P, value: ValueAt<T, P> | undefined): JSONResult;

  // lifecycle
  load(value: T, options?: JSONLoadOptions): JSONResult;
  reset(value?: T): JSONResult;

  // change subscription
  subscribe(listener: JSONChangeListener): () => void;
  readonly state: T;
}

export type JSONChangeListener = (applied: ReadonlyArray<JSONPatchOperation>) => void;

export interface JSONLoadOptions {
  preserveHistory?: boolean;
}
```

### 5.3 Pure core — `applyPatch` / `applyOperation`

```ts
export function applyOperation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  op: JSONPatchOperation,
): ApplyResult<S>;

export function applyPatch<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S>;

export interface ApplyResult<S extends z.ZodType> {
  state: z.output<S>;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}
```

순수함수. React 의존 0. 어떤 환경에서도 import 가능 (서버, Worker, 다른 framework).

`applied` 는 실제로 commit 된 op 목록. 성공 시 입력 ops 와 동일, 실패 시 빈 배열 (G8 atomicity).
Selection state 는 이 배열을 `JSONOps.subscribe` 로 받아 Pointer 좌표를 자동 추적한다 (§0.2).

### 5.4 Pointer 타입 추론

```ts
export type PointerOf<T> = ...;        // schema 타입 → 가능한 Pointer 문자열 union
export type ValueAt<T, P extends string> = ...;
```

깊이 한계: 5단. 그 이상은 `string`으로 fallback (TS 컴파일 비용 관리).

### 5.5 직렬화 헬퍼

```ts
export function serialize<T>(state: T): string;          // validates JSON, then JSON.stringify
export function parse<S extends z.ZodType>(schema: S, json: string): z.output<S>;
export function safeParse<S extends z.ZodType>(
  schema: S,
  json: string,
): { ok: true; state: z.output<S> } | { ok: false; error: z.ZodError };
```

`serialize` 는 non-JSON 값이 있으면 `TypeError` 를 던진다. valid JSON 값에서는 `JSON.stringify` 와 동일하다.

### 5.6 RFC 6901 Pointer 헬퍼 (low-level)

```ts
// Parse / build
export function parsePointer(pointer: Pointer): string[];          // 이스케이프 디코드된 segment 배열
export function tryParsePointer(pointer: Pointer): string[] | null; // parse 실패 시 null
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

### 5.7 `useSelection` — Selection state hook

```ts
export function useSelection<T>(
  ops: JSONOps<T>,
  options?: UseSelectionOptions,
): SelectionState<T>;

export interface UseSelectionOptions {
  mode?: "single" | "multiple" | "extended";  // ARIA Listbox/Tree/Grid 어휘. 기본 "single"
  initial?: ReadonlyArray<JSONPoint>;
}

export type JSONPoint =
  | Pointer
  | {
      path: Pointer;
      offset?: number;                 // text/string caret or range offset
      edge?: "before" | "after";       // item boundary caret
      affinity?: "forward" | "backward";
    };

export interface SelectionRange {
  anchor: JSONPoint;
  focus: JSONPoint;
}

export interface SelectionState<T> {
  ranges: ReadonlyArray<Pointer>;              // legacy selected pointer list
  selectedPointers: ReadonlyArray<Pointer>;    // item/list/tree selection projection
  selectionRanges: ReadonlyArray<SelectionRange>;
  primaryIndex: number;
  anchor: JSONPoint | null;     // primary range 시작점
  focus: JSONPoint | null;      // primary range 끝점. DOM Selection API 의 focus 와 동일 의미.
  isCollapsed: boolean;
  type: "None" | "Caret" | "Range";
  collapse(point: JSONPoint): void;
  setBaseAndExtent(anchor: JSONPoint, focus: JSONPoint): void;
  extend(point: JSONPoint): void;
  addRange(pointOrRange: JSONPoint | SelectionRange): void;
  removeRange(pointOrRangeOrIndex: JSONPoint | SelectionRange | number): void;
  toggleRange(pointOrRange: JSONPoint | SelectionRange): void;
  selectRanges(
    ranges: ReadonlyArray<Pointer | SelectionRange>,
    anchor?: JSONPoint | null,
    focus?: JSONPoint | null,
    primaryIndex?: number,
  ): void;
  empty(): void;
  containsNode(pointer: Pointer): boolean;
}
```

`anchor` / `focus` 는 W3C Selection API 의 좌표 이름이다. `selectionRanges[primaryIndex]` 가 키보드 입력·paste·format command 의 주 작용 범위다.
collapsed selection (`selectionRanges.length === 1`, `anchor === focus`) 이 캐럿이다. `ranges` 는 호환용 selected-pointer projection 이며, 실제 caret/range shape 의 정본은 `selectionRanges` 다.

**자동 규칙 네 가지** — 사용자 wiring 0.

1. **Mutation auto-select**: `applied` 안에 `add` / `copy` / `move` 가 있으면 destination 으로
   새 selection 을 만든다. `/-` 는 actual index 로 resolve. root replace (`""`) 는 무시.
2. **Lost selection recovery**: selection 의 각 `JSONPoint.path` 가 op 후 사라지면 nextSibling → prevSibling → parent
   순으로 복구한다. 다 사라지면 selection 은 `[]`.
3. **Index shift tracking**: 살아남은 항목들의 형제 인덱스가 add/remove 로 밀리면 자동 보정 (`trackPointer`).
4. **Anchor/focus tracking**: 각 range 의 `anchor`/`focus` path 도 같은 규칙으로 추적/복구하고 offset/edge/affinity 는 보존한다.

수동 `collapse/addRange/removeRange/toggleRange/setBaseAndExtent/selectRanges/empty` 는 위 규칙보다 우선한다.

History 의미: selection 단독 변경은 history 비대상. `useJSONDocument` facade 는 patch dispatch 시점에 selection 스냅샷을 같이 entry 에 캡처해 undo/redo 시 같이 원복한다.

### 5.8 Pointer tracking helpers

```ts
export function trackPointer(
  pointer: Pointer,
  applied: ReadonlyArray<JSONPatchOperation>,
): Pointer | null;
```

`useSelection` 이 사용하는 low-level helper. RFC 6902 op 적용 후 기존 Pointer 가 어디로
이동했는지 계산한다. 제거된 좌표는 `null` 이다.

### 5.9 HTTP transport — RFC 5789 + 6902 + 7396

선택적 import (`zod-crud` index 에서 export). 트리쉐이킹 보장. 외부 의존 0 — fetch / axios / 다른 client 와 직접 결합하지 않는다.

```ts
export const JSON_PATCH_MIME  = "application/json-patch+json";   // RFC 6902 §6
export const MERGE_PATCH_MIME = "application/merge-patch+json";  // RFC 7396

export function buildPatchRequest(ops: ReadonlyArray<JSONPatchOperation>): PatchRequest;
export function withIfMatch(req: PatchRequest, etag: string): PatchRequest;            // RFC 5789 §2.4
export function parsePatchResponse(body: string, contentType?: string | null): ParseResult | ParseError;
export function parseMergePatch(patch: unknown, basePath: string): JSONPatchOperation[];
export function applyMergePatch(target: unknown, patch: unknown): unknown;             // RFC 7396 §2 stateful
```

**`parseMergePatch` 의 한계**: nested null = nested remove 의미는 target 컨텍스트 없이 RFC 6902 ops 로 분해 불가하다 (RFC 7396 merge 는 stateful). nested merge 가 필요한 경우 `applyMergePatch(target, patch)` 를 직접 사용한다.

테스트: [`tests/http.test.ts`](https://github.com/developer-1px/zod-crud/tree/main/packages/zod-crud/tests/http.test.ts) — RFC 7396 §2 의 표준 예제 + ETag conditional + content-type negotiation.

### 5.10 `createJSONDocument` / `useJSONDocument` — 공통 facade

```ts
export function createJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UseJSONDocumentOptions<z.output<S>>,
): JSONDocument<z.output<S>>;

export function useJSONDocument<S extends z.ZodType>(
  schema: S,
  initial: z.input<S>,
  options?: UseJSONDocumentOptions<z.output<S>>,
): JSONDocument<z.output<S>>;

export interface JSONDocument<T> {
  value: T;
  selection: SelectionState<T> | undefined;
  clipboard: ClipboardState<T>;
  history: JSONDocumentHistory;
  ops: JSONDocumentOps<T>;
  commands: Commands<T>;
  can: Can<T>;
}
```

`zod-crud` root 의 headless 정체성 표면은 `createJSONDocument` 다. `zod-crud/react` 의 `useJSONDocument` 는
React state/render lifecycle 을 얹은 같은 facade 이다. 둘 다 data, selection, clipboard, history, 10 verbs, guard predicates 를 한 객체로 묶는다.
React entrypoint 의 `useJSON`, `useSelection`, `useJSONSlice`, `useDraft`, `useField` 는 facade 아래의 조합용 low-level hook 이며, core 편집 모델의 소유자는 아니다.
selection 은 `{ selection: false }` 또는 미지정이면 facade 표면에서 `undefined`; 명시적으로 켜면 `SelectionState<T>` 를 노출한다.
clipboard 는 headless JSON fragment buffer 이며 DOM/system clipboard 호출은 사용자 layer 책임이다.
history 는 core reducer 를 사용하며 `undo`, `redo`, `mergeLast`, `transaction` 으로 batch 편집을 한 step 으로 다룰 수 있다.

---

## 6. 에러 — 시끄러움 4단

### 6.1 단계

| 단계 | 시점 | 잡히는 위반 | 표현 |
|------|------|-------------|------|
| 1. TS 타입 | 빌드 | Pointer 형식, value 타입 불일치 | 컴파일 에러 |
| 2. Pointer parse | dispatch 시작 | RFC 6901 형식 위반 | `invalid_pointer` |
| 3. Path resolve | dispatch 시작 | replace/remove/test 대상 없음, move 자기 자손으로 이동 | `path_not_found` / `move_into_self` |
| 4. Schema validate | dispatch 후 (batch는 끝나고 1회) | Zod 검증 실패 | `schema_violation` |
| 5. Serializability assert | dispatch 전/후 | non-JSON 값 진입 | `not_serializable` |

### 6.2 `JSONResult`

```ts
export type JSONResult =
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

- `strict: true` (dev 기본) → 실패 시 `JSONCrudError` throw
- `strict: false` (prod 기본) → `JSONResult` 반환, `onError` 콜백 호출

```ts
export class JSONCrudError extends Error {
  constructor(
    public op: JSONPatchOperation | "load" | "reset" | "patch" | "set",
    public result: Extract<JSONResult, { ok: false }>,
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

### 8.1 표준 결단 (Phase 5 — 외부 표준과의 거리)

| 표준 | 결단 | 이유 |
|------|------|------|
| **RFC 7396** JSON Merge Patch | ✅ **부분 지원** — `http.ts` 의 `parseMergePatch` (top-level 분해) + `applyMergePatch` (stateful merge, 정확) | server 응답 수신 path 의 표준 옵션. nested null 의미는 stateful path 로만 정확. §5.9 |
| **CRDT / OT** (Yjs · Automerge) | ❌ **명시적 비-목표** (헌장 재확인) | (1) RFC 6902 op 는 sequential — commutative 보장 없음. CRDT/OT 변환 시 의미 보존 불가능한 케이스 다수. (2) 협업이 필요한 사용자는 Yjs/Automerge 를 별 substrate 로 두고, 그 결과 state 를 zod-crud 가 받는 path 가 자연 — 우리가 두 substrate 를 흡수하지 않음. (3) 30 년 락인 헌장과 충돌 — RFC 6902 위에 OT 를 얹으면 RFC 안의 의미를 우리가 변형해야 함 |

변경하려면 먼저 현재 코드 동작을 확인한 뒤 이 절을 함께 갱신해야 한다.

## 8.5 라이브러리 책임 (정본 — §0.2)

다음은 **본 라이브러리가 책임진다.**

- Selection model (`JSONPoint`, `SelectionRange[]`, primary range, selected pointer projection, single/multiple/extended 모드)
- 좌표 자동 추적 (RFC 6902 op 적용 시 selection range path 가 추종)
- 직렬화 (모든 좌표 상태가 JSON.stringify round-trip)

---

## 9. 호환성 정책

### 9.1 Public surface

§5와 `package.json` `exports` 에 명시된 항목만 public. `zod-crud/src/*` 또는 `zod-crud/dist/*` import 는 사용자 책임.

### 9.2 Semver

- **major**: §0.3 절대 원칙 변경, public API breaking
- **minor**: 새 헬퍼, 새 옵션 (default 보존)
- **patch**: 버그 수정, G1-G8 보장 강화

### 9.3 표준 추적

- RFC 6901·6902가 obsolete 되거나 successor가 나오면 major bump로 따라감
- Zod major 변경은 별도 릴리즈로 검토
- React 최저 버전은 `useSyncExternalStore` 가용성(>=18) 유지

---

## 10. Source Layout

현재 `packages/zod-crud/src/` 구조:

```
index.ts              ─ headless public export (SPEC §5)
react.ts              ─ React public export (`zod-crud/react`)
createJSONDocument.ts ─ headless document facade (SPEC §5.10)
jsonOps.ts            ─ JSONOps boundary type
hooks/
  useJSON.ts          ─ React state + ops binding (SPEC §5.1·§5.2)
  useJSONDocument.ts  ─ React document facade
  useSelection.ts     ─ selection hook (SPEC §5.7)
  useJSONSlice.ts     ─ pointer slice hook
  useDraft.ts         ─ draft/pending field helpers
  buildJSONDocumentOps.ts
  jsonDocumentHistory.ts
commands/
  buildCommands.ts    ─ commands namespace
  buildCan.ts         ─ can namespace
verbs/
  select.ts move.ts cut.ts copy.ts paste.ts duplicate.ts undo.ts redo.ts find.ts replace.ts
core/
  pointer/            ─ RFC 6901 + PointerOf/ValueAt + serialization helpers
  patch/              ─ RFC 6902 pure core (SPEC §5.3)
  jsonpath/           ─ RFC 9535 query substrate
  selection/          ─ W3C Selection vocabulary and reducers
  schema/             ─ Zod/JSON Schema bridge + preFlight
  history.ts          ─ RFC 6902 inverse + history stack
  track.ts            ─ Pointer tracking
sidecars/
  replayRecording.ts recorder.ts debug-log.ts http.ts
```

향후 SPEC 개정은 현재 코드 동작과 RFC 정합을 먼저 확인한 뒤 이 문서를 함께 갱신한다 (§11).

---

## 11. 분쟁 해결

이 문서와 코드/문서/테스트가 충돌하면:

1. **현재 코드 동작이 이긴다.** 문서가 틀렸으면 문서를 고친다.
2. 코드가 RFC와 충돌하면 **RFC가 이긴다.** 코드를 고치고 문서도 함께 갱신한다.
3. 둘 다 RFC와 일치하나 모호하면 §0.3 원칙으로 판정하고, 코드와 이 문서를 같은 변경에서 갱신한다.

---

**상태**: living specification. 현재 코드 동작을 설명한다.
