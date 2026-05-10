# Core & Design

여기부터는 zod-crud의 아래층입니다. 처음 사용하는 사람은 앞 문서만 읽어도 됩니다. 이 페이지는 “왜 이렇게 설계됐는가”와 “React 밖에서 어떻게 쓰는가”를 설명합니다.

## Core는 React를 모릅니다

`applyPatch`와 `applyOperation`은 순수함수입니다.

```ts
const result = applyPatch(Schema, state, operations);
```

같은 입력을 넣으면 같은 출력이 나옵니다. React state, DOM, 이벤트, 시간, 랜덤 값에 의존하지 않습니다.

::source{path="packages/zod-crud/src/core/patch/index.ts" title="applyPatch" lines="274-329"}

## JSON Pointer

문서 안의 위치는 Pointer로 표현됩니다.

| Pointer | 뜻 |
|---------|----|
| `""` | 문서 전체 |
| `"/title"` | `value.title` |
| `"/items/0"` | `value.items[0]` |
| `"/items/-"` | 배열 끝. add에서 사용 |

사용자 표면에서는 “문서 안의 주소”로 이해하면 됩니다. core 관점에서는 RFC 6901 JSON Pointer입니다.

::source{path="packages/zod-crud/src/core/pointer/index.ts" title="pointer helpers" lines="1-29"}

## JSON Patch

문서 변경은 patch operation으로 표현됩니다.

```ts
{ op: "replace", path: "/title", value: "Next" }
```

사용자 표면에서는 `doc.ops.replace("/title", "Next")`처럼 함수로 씁니다. core 관점에서는 RFC 6902 JSON Patch입니다.

이 표준 형식 덕분에 변경 기록을 저장하거나 서버로 보낼 수 있습니다.

## Pointer tracking

selection이 변경을 따라갈 수 있는 이유는 Pointer tracking입니다. 현재 캐럿도
`selection.focus`로 저장되므로 같은 규칙을 따릅니다.

```ts
const next = trackPointer("/items/2", [
  { op: "remove", path: "/items/0" },
]);
// "/items/1"
```

::source{path="packages/zod-crud/src/core/track.ts" title="trackPointer" lines="131-135"}

## 직렬화

state와 operation은 JSON입니다. 그래서 저장과 복원이 단순합니다.

```ts
const text = serialize(value);
const restored = parse(Schema, text);
```

::source{path="packages/zod-crud/src/core/pointer/serialize.ts" title="serialize helpers" lines="1-29"}

## 왜 UI 컴포넌트가 아닌가요?

편집 UI는 앱마다 다릅니다.

- todo list
- tree editor
- outliner
- table editor
- document editor

모양과 키보드 규칙은 다르지만, 아래 문제는 반복됩니다.

- schema-safe commit
- undo/redo
- selection/caret tracking
- JSON 위치 관리

zod-crud는 이 공통 하부만 맡습니다. 그래서 UI는 직접 만들 수 있고, 편집 상태는 재사용할 수 있습니다.

## 왜 Zod가 중심인가요?

편집기는 “이 문서가 어떤 모양이어야 하는가”를 알아야 합니다. Zod schema는 그 경계를 코드로 선언합니다.

zod-crud는 변경을 먼저 계산한 뒤, schema를 통과할 때만 commit합니다. 그래서 Zod는 이 프로젝트에서 validation helper가 아니라 **문서 편집의 안전 경계**입니다.

## 설계 요약

```txt
사용자 표면
└─ useJsonDocument
   ├─ doc.value
   ├─ doc.ops
   ├─ doc.history
   └─ doc.selection   ← W3C Selection. 캐럿 = collapsed

낮은 레벨 hook
├─ useJson
└─ useSelection

Core
├─ applyPatch / applyOperation
├─ Pointer helpers
├─ tracking helpers
└─ serialize / parse
```

SPEC와 ADR은 이 설계를 더 엄격한 언어로 기록합니다.
