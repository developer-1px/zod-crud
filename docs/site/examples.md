# Lower-level Hooks

`useJsonDocument`가 기본 표면입니다. 하지만 필요하면 더 낮은 레벨 hook을 따로 조합할 수 있습니다.

## 전체 그림

```txt
useJsonDocument
├─ useJson
├─ useSelection
└─ useFocus
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

selection과 focus가 필요 없고, 단순한 JSON 편집만 필요하면 `useJson`만으로 충분합니다.

::source{path="packages/zod-crud/src/hooks/useJson.ts" title="useJson" lines="21-46"}

## `useSelection`

`useSelection`은 선택 상태만 담당합니다.

```ts
const [value, ops] = useJson(Schema, initial);
const selection = useSelection(ops, { mode: "multiple" });
```

`selection`은 `ops.subscribe`를 통해 commit된 변경을 듣고 Pointer를 따라갑니다.

::source{path="packages/zod-crud/src/hooks/useSelection.ts" title="useSelection" lines="9-31"}

## `useFocus`

`useFocus`는 단일 활성 위치를 담당합니다.

```ts
const focus = useFocus(ops, {
  initial: "/items/0",
  recover(state, removed) {
    return state.items.length > 0 ? "/items/0" : null;
  },
});
```

`filter`로 focus 가능한 위치를 제한하고, `recover`로 삭제 후 복구 위치를 정할 수 있습니다.

::source{path="packages/zod-crud/src/hooks/useFocus.ts" title="useFocus" lines="9-20"}

## 언제 lower-level hook을 쓰나요?

| 상황 | 추천 |
|------|------|
| 처음 시작하는 앱 | `useJsonDocument` |
| 값 편집만 필요한 작은 UI | `useJson` |
| selection/focus를 별도 provider로 나누고 싶음 | `useJson` + `useSelection` + `useFocus` |
| React 밖에서 patch만 적용 | `applyPatch` |

처음에는 `useJsonDocument`로 시작하고, 실제로 분리할 이유가 생겼을 때 내려오면 됩니다.

## 예제 읽기

기존 작은 예제들은 낮은 레벨 API를 이해하는 데 도움이 됩니다.

::source{path="apps/site/src/examples/BasicCrud.tsx" title="BasicCrud.tsx" lines="1-35"}
