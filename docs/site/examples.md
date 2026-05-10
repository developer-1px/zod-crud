# Lower-level Hooks

`useJsonDocument`가 기본 표면입니다. 하지만 필요하면 더 낮은 레벨 hook을 따로 조합할 수 있습니다.

## 전체 그림

```txt
useJsonDocument
├─ useJson
└─ useSelection   ← W3C Selection API. 캐럿 = collapsed selection
```

`useJsonDocument`는 위 hook들을 하나의 `doc` 객체로 묶습니다. 반대로 낮은 레벨 hook을 직접 쓰면 상태 경계를 더 세밀하게 나눌 수 있습니다.

## `useJson`

`useJson`은 문서 값과 편집 작업만 제공합니다.

```ts
const [value, ops] = useJson(Schema, initial, {
  history: 50,
});
```

반환값은 tuple입니다.

| 값 | 설명 |
|----|------|
| `value` | schema-valid JSON 값 |
| `ops` | 편집 작업 API |

selection이 필요 없고, 단순한 JSON 편집만 필요하면 `useJson`만으로 충분합니다.

::source{path="packages/zod-crud/src/hooks/useJson.ts" title="useJson" lines="21-46"}

## `useSelection`

`useSelection`은 선택 상태만 담당합니다.

```ts
const [value, ops] = useJson(Schema, initial);
const selection = useSelection(ops, { mode: "multiple" });
```

`selection`은 `ops.subscribe`를 통해 commit된 변경을 듣고 Pointer를 따라갑니다.

::source{path="packages/zod-crud/src/hooks/useSelection.ts" title="useSelection" lines="9-31"}

## 캐럿은 selection 의 한 형태

zod-crud 는 **W3C Selection API** 모델을 따릅니다 — 별도의 focus 축은 없고, **collapsed selection** (`anchor === focus`, `ranges.length === 1`) 이 곧 캐럿입니다.

```ts
selection.collapse("/items/0");        // 단일 캐럿 = collapsed
selection.setBaseAndExtent(a, f);      // 범위 선택
selection.extend(p);                   // anchor 유지, focus 갱신 (Shift+arrow)
selection.focus;                       // 현재 캐럿 위치 (= aria-activedescendant)
selection.isCollapsed;                 // true 면 캐럿 상태
```

DOM `Selection.anchorNode/focusNode/isCollapsed` 와 동일한 어휘입니다. 이전에 분리됐던 `useFocus` 는 폐기되었고, 그 정보는 `selection.focus` 로 통합됩니다.

## 언제 lower-level hook을 쓰나요?

| 상황 | 추천 |
|------|------|
| 처음 시작하는 앱 | `useJsonDocument` |
| 값 편집만 필요한 작은 UI | `useJson` |
| selection을 별도 provider로 분리 | `useJson` + `useSelection` |
| React 밖에서 patch만 적용 | `applyPatch` |

처음에는 `useJsonDocument`로 시작하고, 실제로 분리할 이유가 생겼을 때 내려오면 됩니다.

## 예제 읽기

기존 작은 예제들은 낮은 레벨 API를 이해하는 데 도움이 됩니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}
