# Contract Pressure Register

상태: 표준화 트랙 관찰 문서.

이 문서는 lab, official extension, product recipe에서 반복되는 공통 계약 압력을
기록한다. 목적은 새 core concept을 빨리 추가하는 것이 아니다. 1.0 전에는
반복 압력을 증거로 보존하고, core/official/lab/app-owned 중 어디에 둘지
보수적으로 판단한다.

```txt
product pressure
|-- existing core concept으로 표현 가능한가
|-- 여러 package가 같은 실패 조건을 반복하는가
|-- 같은 이름으로 부를 수 있을 만큼 수렴했는가
|-- app-owned policy와 product-neutral contract를 분리했는가
`-- public API로 얼려도 breaking 위험이 낮은가
```

## 승격 원칙

새 concept은 다음 순서로만 올라간다.

```txt
recipe note
`-- lab convention
    `-- official extension
        `-- core primitive
```

Core 승격은 마지막 단계다. 다음 중 하나라도 불명확하면 core에 넣지 않는다.

- 하나의 product-neutral 이름으로 부를 수 있는가.
- 기존 `can*`, JSON Patch, Pointer, selection, clipboard, history로 표현할 수
  없는가.
- host-owned policy를 core 책임처럼 보이게 만들지 않는가.
- 실패 reason과 result shape를 public API로 오래 유지할 수 있는가.

## 현재 압력 지도

| 후보 | 반복 신호 | 현재 판정 | 다음 증거 |
| --- | --- | --- | --- |
| guard composition | `protected-ranges`, `proposed-changes`, `search-replace`, paste/drop 계열이 guard와 core capability 실패를 조합 | 부분 반영: `@zod-crud/protected-ranges` | 같은 guard result shape가 3개 이상 package에서 자연스럽게 맞는지 확인 |
| patch preview / dry-run | `patch-preview`, `document-diff`, `proposed-changes`, import/review workflow가 apply 전 next value를 요구 | 반영됨: `@zod-crud/patch-preview` | downstream dogfood에서 visual diff/review workflow가 host-owned로 남는지 확인 |
| structural change result | `grouping`, `wrap-unwrap`, `outline`, `bulk-edit`가 prospective operations와 execution result를 노출 | lab convention | `operations`, `selectionAfter`, `diagnostics` naming을 통일할 수 있는지 확인 |
| anchored pointer lifecycle | `comments`, `bookmarks`, `presence-cursors`, review anchor가 `trackPointer` 이후 lost/recovered 상태를 반복 | 부분 반영: `@zod-crud/comments` | generic anchor lifecycle이 bookmark/presence 밖에서도 같은지 확인 |
| stable id to Pointer | Kanban, form builder, import/review, slide/layer selection, blind object editor review에서 반복 | 반영됨: `@zod-crud/id-resolver` | downstream dogfood에서 id policy가 host-owned로 남는지 확인 |
| invalid form draft | form builder, settings, CMS property panel, spreadsheet cell editing에서 valid JSON commit 전 temporary input이 반복 | 반영됨: `@zod-crud/form-draft` | parser/widget/focus policy가 host-owned로 남는지 확인 |
| text search/replace | block docs, review editor, import cleanup, object notes에서 반복 | 반영됨: `@zod-crud/search-replace` | rendered text extraction과 ranking이 host-owned로 남는지 확인 |
| proposed changes | AI edit review, import review, CMS copy review, moderation queues에서 반복 | 반영됨: `@zod-crud/proposed-changes` | approval workflow와 storage/sync가 host-owned로 남는지 확인 |
| TSV/CSV grid paste | grid/table product에서 반복 | lab `grid-paste` (#91) | **별개 확인됨**: `grid-paste`는 2D matrix→rectangle 매핑, `paste-compatible`은 payload shape 적응. TSV/CSV 파싱·clipboard·auto-grow는 host-owned |
| result diagnostic normalization | result diagnostic text를 `reason`으로 통일 | 반영됨 | official/lab extension도 `reason` 우선 유지 |
| semantic contract lock | export lock은 이름만 고정하고 signature/error literal 의미론은 문서와 테스트가 고정 | evaluator 후보 | signature snapshot 또는 semantic fixture를 추가할지 확인 |
| structural object commands | grouping, wrap/unwrap, layer order가 slide/diagram/object editor에서 반복 | official 후보 | 같은 `operations`/`selectionAfter` result shape로 승격 가능한지 확인 |
| sibling-range 정규화 | "선택된 sibling pointer → {공유 parent, 정렬 index, 연속성}" 를 `fill-series`·`move-selection`·`grouping`·`wrap-unwrap`·`layer-order` 5개 독립 확장이 재구현. `grouping`/`wrap-unwrap`의 resolver는 byte 단위 동일 | **반영됨: core `resolveSiblingRange` (#95)** | 순수 path helper로 core 승격(#95), 5개 소비자 모두 수렴(#96/#97/#98). `drag-drop`은 단일 source/target 개별 해석이라 range 대상이 아님(하위 primitive 사용, 제외). 남은 후보: 에러 코드 통일(현재 각 확장이 helper 코드를 자기 코드로 매핑) |

## Guard Composition

현재 core에는 reasoned `can*` capability가 있다. 이것은 guard composition의
기반이지만, host policy guard 자체는 core 책임이 아니다.

반복되는 요구는 다음이다.

```txt
feature intent
|-- host guard 실패면 guard reason을 보존
|-- core can* 실패면 capability reason을 보존
|-- 성공이면 실행에 필요한 feature plan을 보존
`-- execute는 같은 의미론을 다시 검증
```

최소 공유 어휘 후보:

```ts
type GuardResult =
  | { ok: true }
  | { ok: false; code: string; reason: string; pointer?: string; guard?: string };

type GuardedPlan<TPlan> =
  | { ok: true; plan: TPlan; capability: unknown }
  | ({ ok: false; stage: "guard" } & Exclude<GuardResult, { ok: true }>)
  | { ok: false; stage: "capability"; capability: unknown };
```

이 타입은 아직 public API가 아니다. 문서화 목적의 candidate vocabulary다.

승격 금지 조건:

- 권한, visible field, searchable field, stale check, paste adapter를 하나의
  런타임 policy로 강제해야 한다면 실패다.
- async host I/O와 sync document capability를 억지로 한 계약에 넣어야 한다면
  실패다.

## Patch Preview And Plan

`PatchPlan`이라는 이름으로 core concept을 추가하기에는 아직 이르다. 반복 압력은
한 덩어리가 아니라 세 가지다.

```txt
plan pressure
|-- patch preview / dry-run
|-- feature intent normalization
`-- structural result shape
```

현재 방향:

- `patch-preview`는 `@zod-crud/patch-preview` official extension으로 승격했다.
- `PatchPlan`은 core 타입으로 만들지 않는다.
- lab에서는 `operations`, `preview`, `apply`, `diagnostics`, `selectionAfter`를
  같은 의미로 쓰는지 확인한다.

최소 공유 어휘 후보:

| 이름 | 의미 |
| --- | --- |
| `operations` | 적용 예정 JSON Patch batch |
| `preview` | document를 바꾸지 않고 계산한 next value 또는 changed state |
| `apply` | 실제 document execution |
| `diagnostics` | 실행을 막지는 않지만 adapter/import/paste에서 알려야 하는 정보 |
| `selectionAfter` | 구조 편집 후 host가 focus/selection을 옮길 Pointer |

## Anchor Lifecycle

Core `trackPointer`는 patch 이후 Pointer를 추적한다. 그러나 comment, bookmark,
presence, review anchor에서는 다음 lifecycle이 반복된다.

```txt
anchor
|-- live
|-- moved
|-- lost
`-- recovered or discarded by host policy
```

이것은 core `trackPointer`보다 한 단계 높은 concept이다. review comment
feature는 `@zod-crud/comments` official extension으로 반영했다. 그러나 generic
anchor lifecycle을 core나 shared package로 올릴 증거는 아직 부족하다.

## Stable Id To Pointer

Stable id에서 현재 JSON Pointer를 찾는 문제는 여러 제품에서 반복된다. 하지만
id field, uniqueness scope, nested lookup, deleted item 처리, server identity
정책이 제품마다 다르다.

2026-05-30 blind product review 3회에서는 spreadsheet, block docs, object editor가
모두 이 후보를 다시 제기했다. 따라서 `@zod-crud/id-resolver`를 official
extension으로 승격했다. 단, core 승격은 여전히 금지한다.

```txt
stable id resolver
|-- core 아님: id semantics를 모름
|-- official extension: scope + id -> current JSON Pointer
|-- host-owned: id generation, uniqueness repair, route policy
`-- recipe 필요: DnD, URL route, review target에서 먼저 막힘
```

## Result Diagnostic Normalization

세 blind review 모두 `reason`과 `message`가 갈라지는 점을 LLM 오용 지점으로
봤다. 현재 contract는 stable branch key를 `code`로 두고 diagnostic text는
문구 안정성을 보장하지 않는다. 하지만 command palette, disabled reason, toast,
test assertion에서는 한 필드로 읽을 수 있는 편이 낫다.

1차 반영:

```txt
diagnostic text
|-- core result 실패는 `reason`으로 통일 중
|-- validation issue text와 JavaScript Error만 `message` 유지
`-- extension result도 `reason` 우선으로 수렴
```

`violations[].message`와 `JSONCrudError.message`는 result diagnostic이 아니라
각각 validation issue text와 JavaScript Error contract이므로 예외다.

## Semantic Contract Lock

`public-contract.json`은 export name lock이다. 1.0 foundation gate에는 충분하지만
완전하지 않다. Signature, overload, error literal, default option, result family는
표준 문서와 conformance test가 함께 고정해야 한다.

현재 보강된 것:

- Result/error code contract.
- Selection semantics contract.
- Schema introspection contract.
- `strict: false` 기본값.
- Top-level `doc.undo()` / `doc.redo()` Result surface.

다음 후보:

- public type signature snapshot.
- error code fixture.
- selection and clipboard semantic fixture.

## Loop Gate

자가 개선 루프는 각 반복마다 다음 표를 갱신해야 한다.

| 질문 | 통과 기준 |
| --- | --- |
| blind product 평가에서 같은 후보가 다시 나왔는가 | 서로 다른 제품 2개 이상 |
| package 이름/README만 보고 같은 후보를 찾았는가 | 구현 내부 없이 재현 |
| 기존 core concept으로 표현을 시도했는가 | 실패 이유가 구체적 |
| host-owned policy와 product-neutral contract를 분리했는가 | app 책임이 명시됨 |
| 승격 없이 recipe/lab convention으로 충분한가 | 충분하면 core 금지 |

이 gate를 통과하지 못한 후보는 core API에 추가하지 않는다.
