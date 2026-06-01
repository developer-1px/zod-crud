# zod-crud extension delegation standard

상태: 표준화 트랙 초안.

이 문서는 `zod-crud` official extension이 무엇이어야 하는지 정의한다.
핵심은 패키지 수를 늘리는 것이 아니다. `zod-crud`의 목표는 FE 편집 도구에서
이미 표준화된 feature를 두 번 다시 직접 개발하지 않아도 되게 하는 것이다.
official extension은 host app이 반복해서 직접 구현하던 하나의 편집 개념을
명확히 위임받아야 한다.

```txt
official extension
|-- helper/function bundle 아님
|-- app workflow wrapper 아님
|-- core API 불편함을 숨기는 편의 계층 아님
`-- 편집도구들이 반복 구현하는 feature concept의 headless owner
```

## 1. 철학

`zod-crud` core는 primitive foundation이다. core는 schema로 보호되는 JSON
document, pointer, patch, query, selection, clipboard, history, capability를
제공한다. core는 UI, DOM, keyboard, focus, storage lifecycle, system
clipboard permission, product command naming을 소유하지 않는다.

extension은 core보다 편한 wrapper가 아니다. extension은 app과 core 사이에서
반복되는 편집 feature의 의미론을 소유한다.

사용자가 `zod-crud` extension을 쓸 때의 감각은 "라이브러리 함수 몇 개를 가져와
내가 feature를 조립한다"가 아니라 "이 편집 feature를 위임한다"여야 한다.
app-owned는 남는 쓰레기통이 아니다. rendering, focus, product copy, server
policy처럼 제품마다 달라질 수밖에 없는 마지막 책임만 app-owned로 남는다.

```txt
delegation target
|-- FE 편집 도구에서 이미 익숙한 command/capability 이름
|-- feature 규칙과 실패 조건
|-- can/execute parity
|-- patch/payload/order/atomicity planning
|-- schema/capability boundary
`-- reusable feature tests

minimum app-owned residue
|-- rendering and focus
|-- keyboard binding and command palette label
|-- current target source
|-- product-specific copy/policy
`-- remote/server/storage policy
```

host app은 다음을 계속 소유한다.

- 어떤 UI에서 어떤 command를 호출할지.
- 현재 focus, selection, active mode, pointer source가 무엇인지.
- 실패를 toast, dialog, disabled state, silent no-op 중 무엇으로 보여줄지.
- product-specific empty value, naming, layout, keyboard policy.
- extension들을 언제, 어떤 순서와 lifecycle로 조립할지.

위 목록은 extension이 책임을 회피해도 된다는 뜻이 아니다. 같은 feature 방법,
실패 조건, patch planning이 두 app에서 반복된다면 app-owned가 아니라 extension
후보다.

extension은 다음을 소유해야 한다.

- feature 이름이 뜻하는 성공 조건과 실패 조건.
- feature-level `can*` 판단.
- feature 실행에 필요한 JSON Pointer, JSON Patch, payload, ordering, preflight.
- schema/capability/history/clipboard/persistence boundary와의 안전한 접합.
- structured result와 error code.
- app이 반복해서 구현하지 않아도 되는 feature test.

## 2. 핵심 원칙

### 2.1 개념 위임이 먼저다

extension 성공 기준은 LOC 감소가 아니다. 앱이 더 이상 그 편집 개념의
방법을 알지 않아도 되는가가 기준이다.

```txt
함수 호출 수준
|-- app이 feature의 절차를 안다
|-- app이 실패 조건을 안다
|-- app이 patch, payload, index shift를 조립한다
`-- library 함수는 일부 단계만 대신한다

feature 위임 수준
|-- app은 의도와 대상만 말한다
|-- extension이 feature 규칙을 안다
|-- extension이 can, execute, error, atomicity를 책임진다
`-- app에는 UI, target selection, product policy만 남는다
```

강한 위임 기준:

```txt
host code should not know
|-- 어떤 JSON Patch 순서가 안전한지
|-- 어떤 실패 조건이 feature 고유 실패인지
|-- 어떤 index/pointer 조정이 필요한지
|-- 어떤 payload cloning/remapping이 필요한지
`-- 실행 전 disabled reason을 어떻게 계산하는지
```

host code가 이 내용을 계속 알고 있으면 extension을 "사용"하는 것이지 feature를
위임한 것이 아니다.

### 2.2 이름은 위임되는 개념이어야 한다

official extension의 이름은 앱 개발자가 "이 개념은 내가 직접 구현하지
않아도 된다"고 바로 이해할 수 있어야 한다.

좋은 이름은 편집도구의 de facto feature vocabulary에 가깝다. 기준은 공식처럼
보이는 말이 아니라 자주 쓰이거나 불리는 command/feature name이다. 커맨드
팔레트, 메뉴, toolbar, docs heading에 올렸을 때 누구나 기능을 짐작할 수 있어야
한다.

공식 문서에 한 번 나오는 말보다 여러 제품과 사용자가 반복해서 부르는 이름을
우선한다. 흔히 불리는 이름이 있다면 implementation detail, type-system term,
library helper term은 package name이 되면 안 된다.

- `collection`: ordered collection item editing.
- `outline`: hierarchical outline structure editing.
- `clipboard-web`: browser/system clipboard boundary.
- `dirty-state`: clean baseline tracking.
- `persist-web`: web document persistence boundary.

나쁜 이름은 implementation convenience나 product-local vocabulary에 가깝다.

- `utils`, `helpers`, `common`.
- `useDraftState` 같은 특정 app workflow hook.
- `rowTools`, `noteHelpers`, `outlinerExtras`.
- core API를 한두 줄 감싸는 wrapper.
- `coerce`, `ensureFields`, `nodeKind`, `setMembership`처럼 개발자 내부어가
  그대로 드러나는 이름.
- `limit`, `cycle`, `pad`처럼 대상이 빠져 command로 바로 읽히지 않는 이름.

이름 선택 rule:

```txt
name choice
|-- 자주 불리는 editor command/feature name
|-- 여러 제품에서 쓰는 de facto label
|-- product-neutral하지만 누구나 뜻을 아는 label
`-- 마지막으로만 기술적으로 정확한 내부 용어
```

### 2.3 official은 hard gate다

lab package는 상상력을 넓히기 위해 많아도 된다. official extension은
보수적으로 유지해야 한다. official은 사용자에게 "이 개념은 stable
composition boundary다"라고 말하는 계약이기 때문이다.

official 승격은 다음을 의미한다.

- public package name이 concept name이 된다.
- public API가 가능한 한 breaking 없이 유지되어야 한다.
- app authors가 이 개념을 직접 구현하지 않아도 된다고 믿을 수 있어야 한다.
- extension이 core internals 없이 public facade만으로 성립함을 증명해야 한다.

### 2.4 패키지 class를 섞지 않는다

모든 official package가 같은 종류의 feature extension은 아니다. 이름과 문서는
어떤 class의 책임인지 드러내야 한다. 이 구분이 없으면 host boundary나 lifecycle
helper가 editing feature처럼 보이고, core gap 판단이 흐려진다.

```txt
official packages
|-- feature extensions
|   |-- collection
|   |-- outline
|   |-- bulk-edit
|   `-- schema-form
|-- host adapters
|   |-- clipboard-web
|   `-- persist-web
|-- lifecycle adapters
|   `-- dirty-state
`-- instrumentation
    `-- patch-log
```

Feature extension은 편집 command vocabulary를 위임한다. Host adapter는 browser,
storage, system clipboard 같은 실행 boundary를 위임한다. Lifecycle adapter는
clean baseline, restore, save lifecycle 같은 document 주변 상태를 위임한다.
Instrumentation은 patch stream 관찰, replay, audit 같은 관측 책임을 위임한다.

이 class들은 모두 core 밖에 있어야 하지만, promotion gate는 다르게 읽어야 한다.
`collection`이 성공한 이유는 app에서 collection editing 방법이 사라졌기 때문이고,
`clipboard-web`이 성공한 이유는 browser clipboard boundary와 실패 surface가
반복되기 때문이다. 둘을 같은 "feature package"로 평가하면 leak 판정이 흔들린다.

## 3. 판별 기준

다음 질문에서 `Yes`가 많을수록 feature 위임이다. `No`가 많으면 단순 함수
호출 또는 app-local helper다.

| 질문 | 함수 호출 수준 | feature 위임 수준 |
| --- | --- | --- |
| 앱이 feature 실패 조건을 직접 아는가? | Yes | No |
| 앱이 JSON Patch나 index shift를 조립하는가? | Yes | No |
| 앱이 payload envelope, clone, serialization을 직접 다루는가? | Yes | No |
| 같은 기능을 다른 편집도구에서도 반복 구현할까? | 애매함 | Yes |
| 이름이 앱 command 언어와 직접 맞는가? | No | Yes |
| `can*`가 feature 단위로 제공되는가? | No | Yes |
| extension 테스트가 feature 규칙을 검증하는가? | No | Yes |
| 앱 테스트가 여전히 feature 알고리즘을 검증하는가? | Yes | No |
| 앱에 남은 것은 target, UI, UX policy뿐인가? | No | Yes |

한 줄 기준:

```txt
앱 코드에서 feature의 "방법"이 사라지고 "의도 + 대상 + UX 처리"만 남으면 위임이다.
방법이 남아 있으면 단순 함수 호출이다.
```

## 4. MUST gate

official extension은 다음을 만족해야 한다.

### 4.1 Concept identity

extension은 하나의 명확한 편집 concept을 가져야 한다.

- MUST: 이름만 보고 어떤 책임을 위임하는지 알 수 있어야 한다.
- MUST: 같은 concept을 최소 두 종류 이상의 편집도구에 적용할 수 있어야 한다.
- MUST: product noun보다 feature noun을 우선해야 한다.
- MUST NOT: 특정 demo app 이름, 특정 UI metaphor, 특정 product word에 묶이면 안 된다.

예:

```txt
collection
|-- kanban cards
|-- outliner rows
|-- slide rails
|-- layer lists
`-- spreadsheet tabs
```

### 4.2 Delegation depth

extension은 feature의 절차를 충분히 소유해야 한다.

- MUST: `can*`와 실행 method를 같은 feature 단위로 제공해야 한다.
- MUST: invalid target, boundary condition, schema rejection을 structured result로 돌려야 한다.
- MUST: patch ordering, multi-source ordering, pointer tracking, payload spread 같은 feature 내부 절차를 app에 요구하면 안 된다.
- SHOULD: app이 직접 preflight를 반복하지 않아도 되게 해야 한다.
- SHOULD: 실행 method와 `can*`는 가능한 한 같은 검증 의미론을 공유해야 한다.

### 4.3 Public facade only

extension은 core implementation detail에 기대면 안 된다.

- MUST: `zod-crud` public package entrypoint만 import해야 한다.
- MUST NOT: `src/application`, `src/domain`, `src/foundation` 같은 internal path를 import하면 안 된다.
- MUST NOT: private symbol, test helper, implementation-only type을 public contract처럼 사용하면 안 된다.
- SHOULD: extension evaluator로 import boundary를 검사해야 한다.

### 4.4 Headless boundary

extension은 headless여야 한다.

- MUST NOT: DOM rendering, visual selection, CSS, keyboard shortcut, focus lifecycle을 소유하면 안 된다.
- MUST NOT: product-specific toast, modal, toolbar, command palette를 소유하면 안 된다.
- MAY: browser API나 storage API 같은 host boundary를 다룰 수 있다. 이 경우 `-web` 같은 platform suffix가 concept을 더 정확하게 만들면 사용한다.
- MUST: host API가 없는 환경을 structured result로 처리해야 한다.

### 4.5 No plugin registration

extension은 React plugin이나 document plugin으로 등록되는 계층이 아니다.

- MUST: `createX(doc)` 또는 pure function composition 형태여야 한다.
- MUST NOT: `doc.use(...)` 같은 registration을 요구하면 안 된다.
- MUST: extension 자체가 완결적인 조립 단위여야 한다.

이 원칙은 React의 custom hook 생태계와 비슷하다. core는 작게 유지하고,
extension은 필요할 때 함수로 조립한다. 다만 official extension은 custom hook보다
더 엄격하게 concept boundary를 증명해야 한다.

## 5. MUST NOT gate

다음 중 하나에 해당하면 official extension으로 올리면 안 된다.

### 5.1 Helper bundle

여러 작은 함수가 모여 있을 뿐이면 실패다.

```txt
실패 신호
|-- 이름이 utils/helpers/tools/common이다
|-- 각 함수가 서로 다른 변경 이유를 가진다
|-- app이 여전히 feature 알고리즘을 안다
`-- extension 제거 시 app 코드가 조금 길어질 뿐 concept 책임은 그대로다
```

### 5.2 Convenience wrapper

core API가 불편해서 한두 줄 줄이는 wrapper는 official extension이 아니다.

```ts
// official extension으로 부적합
function setTitle(doc, value) {
  return doc.replace("/title", value);
}
```

이 코드는 product-local command거나 app helper다. 편집도구 공통 feature
concept을 위임하지 않는다.

### 5.3 Workflow wrapper

extension들을 특정 product lifecycle로 묶은 wrapper는 official concept이
아닐 수 있다.

예:

```txt
useDraftState
|-- dirty-state를 만든다
|-- persist-web을 만든다
|-- save 후 markClean한다
|-- restore 후 markClean한다
`-- 버튼 disabled와 toast policy에 가까워진다
```

이런 조합은 app-local 예제로는 좋다. official extension으로 승격하면
앱 workflow를 편의 계층으로 고정할 위험이 있다.

### 5.4 Product-local vocabulary

`row`, `card`, `note`, `slide`, `bullet`, `heading` 같은 단어는 대부분
product vocabulary다. official extension 이름은 가능한 한 더 낮은 공통
feature concept을 찾아야 한다.

예:

```txt
row duplicate       -> collection.duplicateAfter
card move           -> collection.moveAfter
bullet indent       -> outline.demote
note draft save     -> persist-web + dirty-state 조립
```

## 6. App boundary

feature 위임이 되어도 app에는 책임이 남는다. 이것은 실패가 아니다.

### 6.1 App이 소유해야 하는 것

```txt
host app
|-- rendering
|-- DOM focus
|-- visual selection
|-- keyboard chord
|-- command palette label
|-- current target selection
|-- product empty value
|-- toast/dialog/error surface
|-- save button disabled policy
|-- route lifecycle
|-- autosave timing
`-- extension 조립 순서
```

### 6.2 Extension이 소유해야 하는 것

```txt
extension
|-- feature vocabulary
|-- feature capability
|-- feature execution
|-- feature failure reasons
|-- feature patch/payload planning
|-- feature atomicity expectations
|-- host boundary result shape
`-- reusable feature tests
```

### 6.3 경계 문장

앱은 다음처럼 말해야 한다.

```ts
createOutline(doc).demote(targets);
createCollection(doc).duplicateAfter(pointer);
await createWebClipboard(doc).copy(targets);
```

앱은 다음을 반복 구현하면 안 된다.

```ts
const index = lastIndex(pointer);
const previous = siblingAt(pointer, index - 1);
doc.patch({ op: "move", from: pointer, path: `${previous}/children/-` });
```

## 7. Dogfood 판정

### 7.1 성공: `@zod-crud/collection`

위임 concept:

```txt
ordered collection item editing
```

앱에서 사라진 책임:

- array item duplicate.
- item delete batching.
- move up/down boundary.
- move before/after across arrays.
- rekey option pass-through.

앱에 남은 책임:

- 현재 target pointer 선택.
- 어떤 command를 어떤 keyboard shortcut에 연결할지.
- 실패 표시.

판정: 성공. helper가 아니라 편집도구 공통 feature concept이다.

### 7.2 강한 성공: `@zod-crud/outline`

위임 concept:

```txt
hierarchical outline structure editing
```

앱에서 사라진 책임:

- demote target의 previous sibling 계산.
- promote owner 계산.
- trailing sibling preservation.
- multi-target pointer tracking.
- patch operation ordering.

앱에 남은 책임:

- selected pointers를 넘긴다.
- Tab/Shift+Tab 같은 keyboard policy를 정한다.
- 실패 toast를 보여준다.

판정: 강한 성공. `demote/promote`는 Markdown list, outliner, document block tree에
반복되는 de facto editing vocabulary다.

### 7.3 성공: `@zod-crud/clipboard-web`

위임 concept:

```txt
web clipboard boundary
```

앱에서 사라진 책임:

- core clipboard payload envelope.
- JSON serialization and parsing.
- `navigator.clipboard` 또는 injected text host read/write.
- clipboard unavailable, parse failure, write failure result.
- host write 실패 시 core clipboard 복구.

앱에 남은 책임:

- paste as sibling인지 child인지.
- browser permission 실패를 어떻게 surface할지.
- 빠른 command 연속 입력을 어떻게 UX로 처리할지.

판정: 성공. async host boundary 때문에 adapter code가 남는 것은 정상이다.
다만 여러 app에서 동일한 queue가 반복되면 `clipboard-web`의 추가 concept이
아니라 command sequencing extension 후보인지 별도로 검토해야 한다.

### 7.4 조건부 성공: `@zod-crud/dirty-state`

위임 concept:

```txt
clean baseline tracking
```

앱에서 사라지는 책임:

- baseline clone.
- current vs baseline comparison.
- mark clean.
- discard to baseline.
- dirty snapshot subscription.

앱에 남는 책임:

- dirty 상태를 어디에 표시할지.
- save 후 mark clean할지.
- route 이동 경고를 띄울지.

판정: concept은 선명하다. 다만 outliner dogfood에서는 feature 구현 제거보다
편집기 기능 추가 성격이 강하다. official 유지 가능하지만 workflow wrapper로
확장하면 안 된다.

### 7.5 조건부 성공: `@zod-crud/persist-web`

위임 concept:

```txt
web document persistence boundary
```

앱에서 사라지는 책임:

- storage-like host read/write/remove.
- persistence envelope.
- savedAt.
- document restore.
- optional selection snapshot restore.

앱에 남는 책임:

- save button, restore button, autosave, route lifecycle.
- dirty-state와 언제 결합할지.
- storage key naming.
- restore conflict policy.

판정: concept은 선명하다. official 유지 가능하다. 단 `save + markClean +
restore + toast + disabled`를 묶은 product workflow는 app-local이어야 한다.

### 7.6 실패: app-local composition hook

예:

```txt
useDraftState
|-- createDirtyState
|-- createDocumentPersistence
|-- save -> markClean
|-- restore -> markClean
`-- app button policy
```

판정: official extension으로 부적합. app-local dogfood adapter로는 좋다.
이것을 official로 만들면 "편집 concept"이 아니라 "특정 앱 workflow"가 된다.

## 8. 승격 프로세스

새 extension 후보는 lab에서 시작한다.

```txt
lab candidate
|-- 이름이 feature concept인지 검토
|-- app 두 곳 이상에서 반복되는지 확인
|-- public facade만으로 구현
|-- can* + execute 제공
|-- feature test 작성
|-- dogfood app에서 app-owned code 제거 확인
`-- official evaluator에 등록
```

### 8.1 Lab-first escalation principle

새 편집 feature는 바로 official package나 core로 올리지 않는다. lab은 package를
늘리는 장소가 아니라 core와 official extension의 경계를 발굴하는 압력실이다.

```txt
labs/extensions
|-- feature 후보를 많이 만든다
|-- public facade만 사용한다
|-- 단일 기능 단위로 유지한다
|-- dogfood app이나 기존 app에 적용한다
|-- app-owned concept code가 줄었는지 확인한다
`-- 여러 lab에서 반복되는 하위 개념을 기록한다

packages/*
|-- 충분히 검증된 extension만 승격한다
|-- 이름이 실제 편집도구 어휘와 맞아야 한다
|-- 범위가 작고 선명해야 한다
|-- app code를 concept 수준에서 얇게 만들어야 한다
`-- breaking 가능성이 낮아야 한다

packages/zod-crud core
|-- 가장 늦게 승격한다
|-- 여러 extension이 같은 primitive를 재구현할 때만 검토한다
|-- product feature 이름을 가져오면 안 된다
`-- core concept 수를 거의 늘리지 않아야 한다
```

core primitive 승격의 1차 신호는 "여러 package에서 같은 코드가 보인다"가
아니다. 더 정확한 신호는 여러 package가 같은 개념적 제약을 직접 해결하느라
feature 구현이 두꺼워지는 것이다.

```txt
core candidate
|-- 3개 이상 lab/official extension에서 같은 하위 개념이 반복된다
|-- public API만으로 구현하면 비효율, 불안정, 중복이 크다
|-- 특정 product 이름 없이 설명된다
|-- 모든 편집 feature가 조합 가능한 primitive로 쓸 수 있다
`-- core에 들어와도 public concept 수가 거의 늘지 않는다

official extension 유지
|-- product/editor feature 이름으로 설명된다
|-- public API만으로 구현 가능하다
|-- app 책임을 확실히 줄인다
|-- 단일 기능 경계가 선명하다
`-- 모든 app에 필요한 것은 아니다

app-owned 유지
|-- UI/UX 결정이다
|-- domain policy다
|-- 특정 product workflow다
`-- 재사용해도 feature 위임이 아니라 함수 호출 수준이다
```

운영 원칙:

- lab first: 새 아이디어는 lab에서 시작한다.
- dogfood required: package만 만들지 않고 실제 app이나 lab에 적용해 app
  책임 감소를 확인한다.
- promotion by evidence: 반복 증거 없이 official로 올리지 않는다.
- core last: core는 여러 extension이 같은 primitive를 재발명할 때만 검토한다.
- concept budget: feature extension은 늘릴 수 있지만 core concept은 거의
  늘리지 않는다.

### 8.2 Duplication audit

승격이나 추출 전에는 중복을 두 종류로 나눈다.

| 중복 종류 | 판정 |
| --- | --- |
| `capabilityError`, `patchError`, `cloneJson` 같은 얇은 result adapter | lab-local 유지. feature별 error code를 보존한다. |
| 같은 target normalization, pointer lifecycle, schema descriptor 같은 하위 개념 | `contract-pressure-register.md`에 기록하고 3개 이상 독립 package에서 반복될 때만 추출 검토 |
| 수동 package 목록이나 오래된 friction report처럼 생성 문서와 충돌하는 설명 | 제거하거나 생성 카탈로그로 위임 |

중복 줄이기가 새 shared package, 새 result family, 새 core type을 만들면 먼저
Occam gate를 통과해야 한다. 코드 줄 수가 줄어도 public concept 수가 늘면 실패할
수 있다.

official 승격 전에는 다음 표를 작성해야 한다.

| 항목 | 질문 |
| --- | --- |
| Concept | 이 package가 맡는 하나의 편집 개념은 무엇인가? |
| Host burden removed | 앱이 더 이상 직접 알 필요 없는 규칙은 무엇인가? |
| Residual app responsibility | 앱에 남아야 하는 UX/product 책임은 무엇인가? |
| Cross-app evidence | outliner 외 어느 편집도구에서도 같은 이름으로 필요한가? |
| can/execute parity | `can*`와 실행 method가 같은 feature semantics를 공유하는가? |
| Public facade | public `zod-crud` entrypoint만으로 구현되는가? |
| Non-goals | UI, focus, keyboard, product workflow를 명시적으로 제외했는가? |
| Failure model | structured result와 error code가 충분한가? |
| Tests | feature 규칙이 app test가 아니라 extension test에 있는가? |

## 9. Scoring rubric

각 항목은 0-3점이다. official 승격은 총점 20점 이상이고 0점 항목이 없어야 한다.

| 항목 | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Concept identity | helper | app-local | reusable but fuzzy | de facto feature concept |
| Delegation depth | app owns rules | partial wrapper | most rules owned | app passes intent + target only |
| Cross-app repeatability | one demo | plausible | two app shapes | many editor families |
| Public facade purity | imports internals | test-only internals | public with leaks | public entrypoint only |
| can/execute model | no can | unrelated can | partial parity | same semantics |
| Error ownership | app maps failures | generic failure | structured but incomplete | feature-level structured results |
| Headless boundary | UI owned | UI assumptions | mostly headless | fully headless |
| Naming clarity | vague | product-specific | near concept | exact concept name |

Hard fail conditions:

- imports zod-crud internals.
- owns DOM rendering or keyboard policy.
- exists only to shorten one app file.
- has no feature-level tests.
- requires plugin registration.
- cannot state what app concept disappeared.

## 10. Review questions

Reviewer는 다음 질문을 순서대로 물어야 한다.

1. 이 extension이 없다면 app이 어떤 concept을 직접 구현해야 하는가?
2. 그 concept은 편집도구 전반에 반복되는가?
3. app은 이제 의도와 target만 전달하는가?
4. app이 여전히 feature failure condition을 알고 있는가?
5. app이 여전히 patch, payload, ordering을 조립하는가?
6. `can*` 없이 UI disabled나 preflight를 구현해야 하는가?
7. extension 이름이 app developer의 command language와 맞는가?
8. extension 테스트가 feature 규칙을 검증하는가?
9. non-goal이 app responsibility로 명확히 돌아갔는가?
10. 이 package가 official이 되면 public concept 수가 늘어나는 값어치를 하는가?

## 11. 요약

```txt
official extension의 목적
`-- app이 반복 구현하던 편집 개념을 위임한다

성공 신호
|-- app은 intent + target만 넘긴다
|-- extension은 can + execute + failure + atomicity를 소유한다
|-- app test에서 feature 알고리즘이 사라진다
|-- extension 이름이 de facto feature vocabulary다
`-- 다른 편집도구에서도 같은 이름으로 필요하다

실패 신호
|-- app-local workflow다
|-- helper bundle이다
|-- core convenience wrapper다
|-- product noun에 묶인다
`-- 앱이 여전히 feature 방법을 알고 있다
```

최종 기준:

```txt
extension은 함수가 아니라 위임 경계다.
앱에서 feature의 방법이 사라지지 않으면 official extension이 아니다.
```
