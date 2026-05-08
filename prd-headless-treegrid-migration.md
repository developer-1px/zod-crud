# PRD — Showcase JsonTreeGrid를 @p/aria-kernel로 재배선

Status: needs-triage
Owner: 유용태
Created: 2026-05-06

## Problem Statement

zod-crud showcase의 JSON treegrid playground는 `@p/aria-kernel`를 의존성으로 선언만 하고 실제로는 import하지 않는다. JsonTreeGrid는 자체 `onKeyDown` if-분기로 키 매칭을 직접 작성했고, 그 결과:

- `spec.md`가 명시한 키 일부가 미구현 또는 어긋남 — Home/End 미구현, Space는 spec의 expand/collapse가 아닌 Cmd+Space의 selection toggle로 가로채짐
- `aria-activedescendant` 또는 roving tabindex가 부재하여 활성 셀이 보조 기술에 노출되지 않음
- `eventSelectionMode`/`SelectionMode` 자체 타입으로 multi-select 분기를 재발명 — `@p/aria-kernel`의 `multiSelect` axis가 이미 제공
- ds가 phase 3c~10에서 도입한 chord string · resolver layer · `axisKeys` 인프라가 한 줄도 적용되지 않음
- 결과적으로 "내 의도라면 너무 쉽게 동작해야 한다"는 사용자 기대와 달리 treegrid playground에 버그가 발생

근본 원인: playground 작성 시점에 headless 패턴(`useTreeGridPattern`)을 import하지 않고 재발명한 것.

## Solution

JsonTreeGrid를 `@p/aria-kernel`의 `useTreeGridPattern`으로 재배선한다. 자체 onKeyDown을 제거하고 chord registry · roving tabindex · ARIA emit · multiSelect axis를 모두 패턴에 위임한다. headless 어휘에 부족한 부분(셀 인라인 값 편집, 클립보드/히스토리 명령)은 ds 라이브러리 측에 1급 어휘로 추가하여 다른 소비자도 재사용 가능하게 한다.

마이그레이션은 회귀 추적이 가능하도록 3단계로 점진 진행한다.

## User Stories

1. As a showcase 사용자, I want ArrowUp/Down으로 행 이동이 즉시 동작하기를, so that JSON 트리를 키보드만으로 탐색할 수 있다
2. As a showcase 사용자, I want ArrowLeft가 expanded 행을 collapse하고 그 외에는 부모로 이동하기를, so that 트리 깊이를 키 한 번으로 줄일 수 있다
3. As a showcase 사용자, I want ArrowRight가 collapsed 행을 expand하고 그 외에는 첫 자식으로 이동하기를, so that 트리 깊이를 키 한 번으로 늘릴 수 있다
4. As a showcase 사용자, I want Home/End가 첫/마지막 행으로 이동하기를, so that 긴 트리 끝으로 즉시 점프할 수 있다
5. As a showcase 사용자, I want Space가 expandable 행에서 expand/collapse를 토글하기를, so that 마우스 없이 펼침을 제어할 수 있다
6. As a showcase 사용자, I want Cmd+클릭으로 selection을 토글하기를, so that 떨어진 항목을 동시에 선택할 수 있다
7. As a showcase 사용자, I want Shift+ArrowDown/Up으로 selection 범위를 확장하기를, so that 연속 항목을 키보드로 선택할 수 있다
8. As a showcase 사용자, I want Enter로 활성 셀의 값 편집을 시작하기를, so that 마우스 더블클릭 없이 편집 모드로 진입할 수 있다
9. As a showcase 사용자, I want 편집 중 Enter로 commit · Escape로 cancel 동작하기를, so that 명시적 의도로 편집을 종료할 수 있다
10. As a showcase 사용자, I want 편집 모드 동안 화살표 키가 행 이동을 일으키지 않기를, so that 입력 텍스트 안에서 커서가 정상 이동한다
11. As a showcase 사용자, I want Delete로 활성 노드를 삭제하기를, so that 마우스 메뉴 없이 노드를 제거할 수 있다
12. As a showcase 사용자, I want Cmd+C/X/V로 클립보드 명령을 실행하기를, so that OS 표준과 동일한 키로 노드를 옮길 수 있다
13. As a showcase 사용자, I want Cmd+Z / Cmd+Shift+Z로 undo/redo하기를, so that 실수를 즉시 되돌릴 수 있다
14. As a showcase 사용자, I want Cmd+C/X/V/Z가 InlineValueEditor 입력 중에는 OS 텍스트 동작을 가로채지 않기를, so that 텍스트 편집 시 OS 클립보드와 충돌하지 않는다
15. As a showcase 사용자, I want 명령 성공 후 활성 행이 `OperationResult.focusNodeId`를 따라가기를, so that 변경된 노드가 즉시 시각적 초점이 된다
16. As a showcase 사용자, I want focus 대상의 모든 ancestors가 자동 expand되기를, so that 변경 결과가 화면에 항상 보인다
17. As a screen reader 사용자, I want 활성 셀이 `aria-activedescendant` 또는 roving tabindex로 노출되기를, so that 보조 기술이 어느 셀이 활성인지 알 수 있다
18. As a screen reader 사용자, I want `role=treegrid` · `aria-rowindex` · `aria-colindex` · `aria-level` · `aria-expanded` · `aria-selected`가 ARIA APG TreeGrid 권장에 따라 emit되기를, so that 트리 구조와 선택 상태를 정확히 인지할 수 있다
19. As a headless 라이브러리 소비자, I want `valueEditable` 옵션과 `editValue`/`commitValue`/`cancelEdit` intent가 1급 어휘로 제공되기를, so that 셀 인라인 값 편집을 자체 onKeyDown 없이 구현할 수 있다
20. As a headless 라이브러리 소비자, I want clipboard/history chord registry가 라이브러리에서 export되기를, so that application 명령을 일관된 어휘로 바인딩할 수 있다
21. As a showcase 개발자, I want zod-crud `JsonDoc`이 headless `NormalizedData`를 모르는 상태로 유지되기를, so that 두 라이브러리 간 의존 방향이 단방향으로 유지된다
22. As a showcase 개발자, I want expand 상태가 zod-crud 문서에 영속되지 않고 host React state로만 유지되기를, so that undo/redo가 expand 상태를 의도치 않게 되돌리지 않는다
23. As a showcase 개발자, I want 마이그레이션이 3단계로 분할되기를, so that 각 단계마다 회귀를 격리 추적할 수 있다

## Implementation Decisions

### 데이터 어댑터

- showcase 내부 어댑터 모듈을 신규 도입한다. 입력은 zod-crud `JsonDoc` + host가 보유한 `expanded: Set<NodeId>`, 출력은 headless `NormalizedData`
- zod-crud는 headless를 인지하지 않는다 — 어댑터는 일방향(zod-crud → headless)
- expand 상태는 host React state. 어댑터의 `getExpanded(id)`가 host Set을 조회한다. zod-crud 문서 모델에 expand 필드를 추가하지 않는다

### Pattern 옵션

- `useTreeGridPattern(data, onEvent, opts)` 마운트
- `multiSelectable: true` — 현재의 Cmd+클릭/Shift+화살표 다중 선택 동작 유지
- `navigationMode: 'row'` — Left/Right가 컬럼 이동이 아닌 collapse/parent · expand/firstChild 합성 (spec.md의 cell 모드 문구는 별도 갱신)
- `label: 'JSON document tree'` — 컨테이너 ARIA 이름

### headless 라이브러리 확장

- `valueEditable: boolean` 옵션을 `useTreeGridPattern`에 추가 — 기본 false
- `editValue` / `commitValue` / `cancelEdit` UiEvent intent 신규 정의
- `valueEditable: true`일 때 패턴이 edit-mode를 1급 상태로 보유하고, edit-mode 동안 화살표/Enter는 host에 navigate intent로 흐르지 않는다
- Enter는 edit-mode 진입(editValue), Escape는 cancel(cancelEdit), 편집 input 안에서 Enter는 commit(commitValue)
- `clipboardAxis` / `historyAxis` (또는 동등한 chord registry export)를 라이브러리에서 노출 — `composeAxes`의 default treeGrid 합성에는 포함하지 않음(OCP)
- `remove` intent의 default chord에 `Delete` 추가 (현재 Backspace만)

### Application 명령 바인딩

- Cmd+C/X/V, Delete, Cmd+Z, Cmd+Shift+Z는 treegrid 컨테이너 scope `bindGlobalKeyMap`으로 host가 바인딩
- chord 어휘는 headless의 `clipboardAxis`/`historyAxis`에서 import — host는 어휘를 재발명하지 않는다
- bindGlobalKeyMap은 active element가 input·textarea·contenteditable일 때 발사하지 않아야 한다 (OS 텍스트 동작과 충돌 방지)

### Focus 모델

- focus는 기본 uncontrolled — pattern 내부 roving tabindex가 키 nav 동안 자체 관리
- `NormalizedData.getFocused()` 또는 동등한 주입 경로로 host가 외부 focusedId를 주입할 수 있다 — 주입 시 외부 우선
- 명령 성공 후 host가 `OperationResult.focusNodeId`를 외부 focus로 setState하고, 동시에 ancestors를 expanded Set에 추가한다

### Selection 모델

- `eventSelectionMode` / `SelectionMode` 자체 타입 제거 — `multiSelect` axis가 emit하는 selection intent를 host가 zod-crud 호출로 라우팅
- `selectedIds: Set<NodeId>`는 host state로 유지, 패턴이 `getSelected(id)`로 read

### 마이그레이션 단계

- **Phase 1** — 어댑터 신설, `useTreeGridPattern` 마운트, navigate/expand/multiSelect를 패턴에 위임. edit/clipboard/history/focus는 자체 잔존 허용
- **Phase 2** — ds repo 측 `valueEditable` + `editValue`/`commitValue`/`cancelEdit` 어휘 추가. showcase의 InlineValueEditor 진입을 패턴 emit으로 전환
- **Phase 3** — ds repo 측 `clipboardAxis`/`historyAxis` 추가. showcase가 `bindGlobalKeyMap`으로 application 명령 바인딩. focusNodeId 외부 주입 합류

### 호환성 보존

- spec.md의 키 계약(현재 cell 모드 표현은 row 모드로 spec 갱신 필요)
- zod-crud 호출 시그니처 — `OperationResult.changes`, `focusNodeId` 등 외부 계약은 변경하지 않는다
- showcase의 EntityRegistry · CommandMatrix · 외부 API는 무영향

## Testing Decisions

좋은 테스트의 기준 — **외부 행동만 검증**한다. roving tabindex 내부 ref·useEffect 호출 순서·NormalizedData 변환 캐시 같은 구현 디테일은 테스트 대상이 아니다. 키 입력 → DOM aria 상태 · zod-crud 호출 인자만 본다.

### 테스트 대상

1. **데이터 어댑터** — `JsonDoc + expandedSet → NormalizedData` 변환의 외부 행동
   - children 순서 보존
   - expandedSet에 없는 노드의 `getExpanded` false
   - 루트 노드의 `getChildren(ROOT)` 정확성
   - prior art: `packages/zod-crud/src/**/*.test.ts` (Vitest 단위 테스트)

2. **JsonTreeGrid 통합** — pattern 합류 후 키 입력에 대한 zod-crud 호출 + ARIA 상태
   - ArrowDown 입력 → host가 onMove를 다음 행 id로 호출
   - Space 입력 (expandable 행) → onExpand가 토글된 상태로 호출
   - Cmd+클릭 → onSelect가 toggle 모드로 호출
   - Enter 입력 → onStartValueEdit (Phase 1) 또는 editValue intent (Phase 2~)
   - 활성 행에 `aria-selected="true"`, `tabindex="0"` 또는 `aria-activedescendant` 매핑
   - prior art: 현재 repo에 React 컴포넌트 통합 테스트는 부재. 도입 시 `@testing-library/react` + `userEvent`를 신규 추가

3. **headless 확장 어휘** (ds repo 측 작업)
   - `valueEditable: true`에서 Enter → editValue emit, edit-mode 진입 후 화살표 무시
   - clipboardAxis chord registry의 `$mod+c/x/v` 매칭
   - prior art: `ds/packages/headless/src/patterns/*.test.tsx` (Vitest)

### 비대상

- 스타일/레이아웃 회귀 — 별도 시각 테스트 도구가 도입되지 않은 이상 수동 확인
- 브라우저별 modifier 분기 — chord parser가 이미 `$mod`로 추상화하므로 단위 검증 불필요

## Out of Scope

- spec.md의 cell-navigation 문구를 row-navigation으로 갱신하는 작업 (PRD 별건)
- zod-crud 라이브러리 본체 API 변경
- showcase의 EntityRegistry · CommandMatrix · 스타일링
- nested-ui-lab 앱 — 현재 `@p/aria-kernel` 미의존이며 이번 마이그레이션 범위 밖
- 새로운 application 명령 추가 (find/replace 등)
- ds headless의 다른 패턴 마이그레이션

## Further Notes

- ds repo는 별도 워크트리. Phase 2/3에서 ds 측 어휘 확장이 필요하며, 그 작업은 ds repo의 PR로 제출하고 머지 후 zod-crud 측이 흡수한다
- 현재 ds 측 빌드는 `middleware.ts` 삭제와 `index.ts` dangling import의 일관성이 잡혀 빌드 가능 상태
- `apps/showcase/package.json`의 `@p/aria-kernel`는 `file:../../../ds/packages/headless` 링크. ds 빌드 산출물 갱신 시 zod-crud 측 `npm install`로 흡수
- 본 PRD는 `/discuss` + `/grill-me` 11개 결정의 합의 산물이며, 결정 변경은 별도 discuss로 제기한다
