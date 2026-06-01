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
| structural change result | `grouping`, `wrap-selection`, `outline`, `bulk-edit`가 prospective operations와 execution result를 노출 | lab convention | `operations`, `selectionAfter`, `diagnostics` naming을 통일할 수 있는지 확인 |
| anchored pointer lifecycle | `comments`, `bookmarks`, `live-cursors`, review anchor가 `trackPointer` 이후 lost/recovered 상태를 반복 | 부분 반영: `@zod-crud/comments` | generic anchor lifecycle이 bookmark/presence 밖에서도 같은지 확인 |
| stable id to Pointer | Kanban, form builder, import/review, slide/layer selection, blind object editor review에서 반복 | 반영됨: `@zod-crud/id-resolver` | downstream dogfood에서 id policy가 host-owned로 남는지 확인 |
| invalid form draft | form builder, settings, CMS property panel, spreadsheet cell editing에서 valid JSON commit 전 temporary input이 반복 | 반영됨: `@zod-crud/form-draft` | parser/widget/focus policy가 host-owned로 남는지 확인 |
| text search/replace | block docs, review editor, import cleanup, object notes에서 반복 | 반영됨: `@zod-crud/search-replace` | rendered text extraction과 ranking이 host-owned로 남는지 확인 |
| proposed changes | AI edit review, import review, CMS copy review, moderation queues에서 반복 | 반영됨: `@zod-crud/proposed-changes` | approval workflow와 storage/sync가 host-owned로 남는지 확인 |
| TSV/CSV grid paste | grid/table product에서 반복 | lab `paste-cells` (#91) | **별개 확인됨**: `paste-cells`는 2D matrix→rectangle 매핑, `paste-special`은 payload shape 적응. TSV/CSV 파싱·clipboard·auto-grow는 host-owned |
| result diagnostic normalization | result diagnostic text를 `reason`으로 통일 | 반영됨 | official/lab extension도 `reason` 우선 유지 |
| lab result boilerplate | 여러 lab이 `capabilityError`/`patchError`/`error`/`cloneJson` helper를 반복 | lab convention | helper 모양만으로 shared package/core를 만들지 않는다. 같은 실패 의미론이나 실행 단계가 반복될 때만 후보로 기록 |
| command-sized feature granularity | `pad-text`, `trim-text`, `round`, `limit-items` 같은 단일 field/array command lab이 빠르게 증가 | reusable command feature | 편집도구 command로 이름 붙일 수 있으면 feature다. package 배포 단위와 feature 판정은 분리 |
| semantic contract lock | export lock은 이름만 고정하고 signature/error literal 의미론은 문서와 테스트가 고정 | evaluator 후보 | signature snapshot 또는 semantic fixture를 추가할지 확인 |
| structural object commands | grouping, wrap/unwrap, layer order가 slide/diagram/object editor에서 반복 | official 후보 | 같은 `operations`/`selectionAfter` result shape로 승격 가능한지 확인 |
| sibling-range 정규화 | "선택된 sibling pointer → {공유 parent, 정렬 index, 연속성}" 를 `fill-series`·`move-selected`·`grouping`·`wrap-selection`·`layer-order` 5개 독립 확장이 재구현. `grouping`/`wrap-selection`의 resolver는 byte 단위 동일 | **반영됨: core `resolveSiblingRange` (#95)** | 순수 path helper로 core 승격(#95), 5개 소비자 모두 수렴(#96/#97/#98). `drag-drop`은 단일 source/target 개별 해석이라 range 대상이 아님(하위 primitive 사용, 제외). 남은 후보: 에러 코드 통일(현재 각 확장이 helper 코드를 자기 코드로 매핑) |

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

## Lab Boilerplate Duplication

2026-06-01 기준 lab 확장이 30개 이상으로 늘면서 다음 코드 모양이 반복된다.

```txt
lab boilerplate
|-- feature-local ErrorCode union
|-- capabilityError / patchError mapping
|-- error(code, reason, pointer?) constructor
`-- cloneJson for planned values
```

판정: 아직 shared extension utility나 core 후보가 아니다. 이유는 반복되는 것이
하위 개념이 아니라 각 feature의 public result contract를 보존하기 위한 얇은
adapter이기 때문이다.

추출 금지 조건:

- helper를 뽑으면 lab package가 서로 의존하게 된다.
- error code literal이 feature별 이름을 잃는다.
- core가 extension 결과 모양을 소유하는 것처럼 보인다.

추출 후보 조건:

- 3개 이상 package가 같은 실행 단계 이름과 같은 실패 의미론을 공유한다.
- app 또는 official promotion에서 같은 result family를 문서화해야 한다.
- shared code가 feature-local error code를 숨기지 않고 보존한다.

## Lab Feature Midcheck

2026-06-01 기준 lab extension 37개를 다음 질문으로 전수 검사했다. 여기서
"feature"는 official package 승격 여부가 아니라, 편집 도구가 재사용 가능한
command 또는 headless capability로 이름 붙일 수 있는가를 뜻한다.

```txt
lab feature check
|-- host가 의도와 target만 넘기면 되는가
|-- feature 실패 조건과 atomicity를 package가 소유하는가
|-- app-owned가 제품별 잔여 책임으로 최소화됐는가
|-- UI, keyboard, focus, route, storage policy가 빠져 있는가
|-- editor command palette에 같은 이름으로 올려도 어색하지 않은가
`-- 두 종류 이상의 editor/product에서 같은 이름으로 쓸 수 있는가
```

전수 판정:

| Lab | Kind | Midcheck | Note |
| --- | --- | --- | --- |
| `autosave` | lifecycle | pass | `save latest valid document after changes`라는 재사용 lifecycle feature다. retry/offline/conflict는 host-owned로 남아 있음 |
| `batch-update` | command | pass | selection-driven `set field across targets`; `bulk-edit`의 query-driven batch와 구분됨 |
| `bookmarks` | state/anchor | pass | named pointer tracking feature다. browser bookmark/route state와 다름 |
| `checkpoints` | lifecycle/state | pass | named restore point feature다. version graph/storage는 제외됨 |
| `clear-contents` | command | pass | `clear contents/reset values` command로 재사용 가능. enum/object default policy는 host-owned |
| `convert-type` | command | pass-watch | data cleanup/import command로 유효. 편집 UI 이름은 `convert type`이 더 친숙할 수 있음 |
| `sort-items` | command | pass | array sort/reverse command. comparator와 rendered sort UI는 host-owned |
| `calculated-fields` | derived-state | pass-watch | computed field sync feature다. formula language/dependency runtime/scheduler는 host-owned |
| `convert-block-type` | command | pass | block/object kind conversion command. field preservation and factory policy는 host-owned |
| `toggle-value` | command | pass | boolean/select/status toggle or next-value command. schema `allowed` 또는 host `values`로 충분히 독립적 |
| `dedupe` | command | pass | remove duplicates command. key policy는 `keyOf`로 host-owned |
| `document-diff` | boundary/command | pass | target document reconcile/apply feature. merge UI and identity matching은 제외됨 |
| `drag-drop` | boundary/command | pass | headless drop intent feature. DOM drag events/hit testing은 제외됨 |
| `apply-defaults` | command | pass | add missing keys from defaults command. deep merge/overwrite는 제외됨 |
| `fill-blanks` | command | pass | fill blanks/default missing slots command. target selection and absent-key creation은 제외됨 |
| `fill-series` | command | pass | spreadsheet autofill/linear series command. date/pattern series and fill-handle UI는 제외됨 |
| `fill-down` | command | pass | `ffill`/fill-down-blanks command. interpolation and constant fill과 구분됨 |
| `paste-cells` | command/boundary | pass | 2D matrix to rectangular region paste command. TSV parsing/clipboard/auto-grow는 제외됨 |
| `grouping` | command | pass | group/ungroup command. visual geometry/group coordinates는 host-owned |
| `join-text` | command | pass | array-to-string edit command. pure display formatting과 구분됨 |
| `layer-order` | command | pass | bring/send layer stack command set. geometry/z-index rendering은 제외됨 |
| `limit-items` | command | pass | cap array length command로 유효. 대상이 package name에 드러남 |
| `move-selected` | command | pass | contiguous sibling block move command. single-item move/drag/drop/cross-array move와 구분됨 |
| `increment-number` | command | pass | increment/decrement/step numeric field command. spinner UI/formatting/unit은 제외됨 |
| `pad-text` | command | pass | pad text/string command. number formatting/display alignment와 구분됨 |
| `paste-special` | boundary/adapter | pass | external payload adaptation before paste. clipboard I/O and autocomplete UI는 제외됨 |
| `live-cursors` | state/anchor | pass | remote cursor/selection presence feature. realtime transport and CRDT/OT are excluded |
| `references` | state/relation | pass | stable references/backlinks feature. routing/rendered links/remote lookup은 제외됨 |
| `renumber-items` | command | pass | sync order field to array position command. actual reorder and fractional indexing are excluded |
| `round` | command | pass | round/snap number command. currency formatting and increment-number are distinct |
| `toggle-option` | command | pass | tag/multi-select add/remove/toggle command. ordering and dedupe cleanup are distinct |
| `generate-slug` | command | pass | title-to-slug derivation command. uniqueness/transliteration are host-owned |
| `split-text` | command | pass | string-to-array split command. CSV/TSV parser and split-to-columns are excluded |
| `swap-items` | command | pass | exchange two items command로 유효. same-array item scope는 README가 명시함 |
| `change-case` | command | pass | case/trim/title text transform command. rich text toolbar/locale casing are excluded |
| `trim-text` | command | pass | stored text cap command. display CSS truncation and grapheme policy are excluded |
| `wrap-selection` | command | pass | structural wrap/unwrap command. grouping/layout containers와 구분됨 |

중간검사 결과 제거 후보는 없다. 다만 판정 축을 분리한다.

- Feature 판정: command/capability 이름으로 재사용 가능한가.
- Package 승격 판정: public package로 얼릴 만큼 evidence와 stability가 있는가.
- Core 승격 판정: 여러 feature가 같은 product-neutral primitive를 재구현하는가.
- App-owned 판정: 제품마다 달라질 수밖에 없는 잔여 책임인가, 아니면 feature
  알고리즘을 host에 떠넘긴 것인가.

따라서 `pad-text`, `trim-text`, `round`, `split-text` 같은 작은 lab도 feature 이름은
유효하다. 다만 이것을 개별 official package로 배포할지, suite로 묶을지, recipe로
둘지는 별도 결정이다. 외부 네이밍 audit의 hard/soft watch는 실제 package rename에
반영했다. 남은 watch는 이름 문제가 아니라 위임 깊이와 public API stability 문제다.

### External Naming Result

외부 조사 표는 `docs/research/de-facto-editing-feature-taxonomy.md`의
`Lab Naming External Audit`에 둔다. 이 문서에는 표준화 압력만 남긴다.

네이밍 기준은 "기술적으로 정확한가"보다 "자주 쓰이거나 불리는 editor command /
feature name인가"다. 커맨드 팔레트, 메뉴, toolbar, docs heading에 올렸을 때
누구나 기능을 짐작할 수 있는 이름을 우선한다.

반영 결과:

| Rename class | Packages | Result |
| --- | --- | --- |
| hard watch resolved | `convert-type`, `convert-block-type`, `toggle-value`, `apply-defaults`, `limit-items`, `pad-text`, `paste-special`, `renumber-items`, `toggle-option`, `trim-text` | 내부어/너무 넓은 이름을 command-like package name으로 변경 |
| soft watch resolved | `batch-update`, `sort-items`, `calculated-fields`, `fill-blanks`, `fill-down`, `paste-cells`, `move-selected`, `increment-number`, `live-cursors`, `generate-slug`, `swap-items`, `change-case`, `wrap-selection` | 외부 제품 어휘에 더 가까운 label로 변경 |
| kept | `autosave`, `bookmarks`, `checkpoints`, `dedupe`, `drag-drop`, `fill-series`, `grouping`, `join-text`, `layer-order`, `references`, `round`, `split-text` | 이미 자주 불리는 editor feature vocabulary라 유지 |

중간검사의 다음 루프는 각 lab README의 `Non-goals`를 다시 읽고 app-owned가
최소 잔여 책임인지 확인하는 것이다. 반복 가능한 feature 방법이 `Non-goals`에
있으면 그 lab은 아직 충분히 위임되지 않은 상태다.

### Delegation Lens

위 표가 "feature 이름을 붙일 수 있는가"를 봤다면, 다음 표는 더 강한 질문을
묻는다.

```txt
delegation lens
|-- app이 feature 알고리즘을 더 이상 모르는가
|-- app-owned가 rendering/focus/current target/product policy만 남는가
|-- host callback은 product policy 주입인가, feature 구현 떠넘기기인가
`-- 같은 feature를 쓰는 두 번째 app이 거의 설정만 바꾸면 되는가
```

| Lab | Delegation | App-owned residue | Midcheck action |
| --- | --- | --- | --- |
| `autosave` | partial | host save transport, scheduler, retry/offline/conflict policy가 큼 | coalescing/status는 위임됐지만 "autosave" 기대치에는 retry/backoff/offline profile 후보가 남음 |
| `batch-update` | strong | target selection, value/compute policy | 유지. batch atomicity, per-target patch, failure는 위임됨 |
| `bookmarks` | strong | bookmark names, persistence, focus sync | 유지. pointer tracking/lost state는 위임됨 |
| `checkpoints` | strong | persistence, retention, compare/restore UI | 유지. named snapshot/restore mechanics는 위임됨 |
| `clear-contents` | mostly | ambiguous enum/object empty policy | 유지. schema-derived clear는 위임됐고 `emptyFor`는 product policy |
| `convert-type` | strong | target type choice, locale-specific parsing beyond built-ins | 유지하되 command label은 `convert type` 후보 |
| `sort-items` | mostly | comparator/sort key, rendered sort UI | 유지. array replacement, reverse, can/execute는 위임됨 |
| `calculated-fields` | partial | formula definitions, dependency graph, scheduling | deepen 후보. 현재는 sync boundary 위임이고 "computed fields" 전체는 아직 host가 많이 앎 |
| `convert-block-type` | mostly | kind descriptor, field preservation, default factory | 유지. conversion patch/failure는 위임됐고 schema-specific factory는 product policy |
| `toggle-value` | strong | optional custom order via `values` | 유지. boolean/closed-set toggle-value mechanics는 위임됨 |
| `dedupe` | mostly | duplicate key policy for objects | 유지. dedupe mechanics/atomicity는 위임됨 |
| `document-diff` | mostly | merge UI, identity matching, conflict policy | 유지. target-value reconciliation is delegated; identity-aware diff remains a separate feature |
| `drag-drop` | mostly | DOM event decoding, hit testing, visual insertion affordance | 유지. headless drop intent to edit operation is delegated |
| `apply-defaults` | strong | defaults map | 유지. additive missing-key mechanics are delegated |
| `fill-blanks` | mostly | target source, custom emptiness/value policy | 유지. conditional fill mechanics are delegated |
| `fill-series` | mostly | date/pattern series generator, fill-handle UI | 유지. contiguous range + constant/linear fill are delegated |
| `fill-down` | strong | custom emptiness policy | 유지. ffill mechanics are delegated |
| `paste-cells` | mostly | clipboard parsing, column-to-field mapping, auto-grow policy | 유지. matrix-to-rectangle write mechanics are delegated |
| `grouping` | mostly | group shape factory, visual geometry | 유지. group/ungroup range mechanics are delegated |
| `join-text` | strong | locale formatting policy via separator/map | 유지. array-to-string write mechanics are delegated |
| `layer-order` | strong | visual selection source, geometry not involved | 유지. bring/send stack mechanics are delegated |
| `limit-items` | strong | when to run after insert, survivor policy beyond start/end | 유지 |
| `move-selected` | strong | source/target selection and focus | 유지. contiguous block move mechanics are delegated |
| `increment-number` | strong | rendered spinner/unit/formatting | 유지. numeric step/clamp mechanics are delegated |
| `pad-text` | strong | target choice, number formatting if needed | 유지. stored string padding mechanics are delegated |
| `paste-special` | partial | payload adaptation rules are the hard part and live in host adapter | deepen 후보. boundary/error preservation is delegated; common adapters may be needed for full feature delegation |
| `live-cursors` | mostly | realtime transport, identity/color policy, timeout | 유지. remote anchor tracking over patches is delegated |
| `references` | mostly | descriptor/readId/query policy, routing/remote lookup | 유지. indexing/backlink/set-reference mechanics are delegated |
| `renumber-items` | strong | when reorder has happened, field name | 유지. order-field sync mechanics are delegated |
| `round` | strong | target choice, currency/locale display | 유지. round/snap mechanics are delegated |
| `toggle-option` | mostly | object identity key and ordering policy | 유지. add/remove/toggle mechanics are delegated |
| `generate-slug` | mostly | uniqueness/collision and non-Latin transliteration | 유지. slug derivation mechanics are delegated |
| `split-text` | strong | delimiter choice, CSV/TSV parser if needed | 유지. string-to-array write mechanics are delegated |
| `swap-items` | strong | target selection, same-array scope wording | 유지 |
| `change-case` | strong | locale-aware casing/rich text formatting | 유지. stored string transform mechanics are delegated |
| `trim-text` | strong | grapheme/locale policy if needed | 유지. stored text cap mechanics are delegated |
| `wrap-selection` | mostly | wrapper shape factory, product container policy | 유지. wrap/unwrap range mechanics are delegated |

`partial`은 제거 판정이 아니다. 완전 위임이라는 제품 목표에서 다음에 깊게 만들
후보라는 뜻이다. 현재 우선순위는 `calculated-fields`, `paste-special`,
`autosave`다. 세 package 모두 이름은 feature로 유효하지만, host callback이
product policy 주입인지 feature 구현 위임 실패인지 더 확인해야 한다.

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
