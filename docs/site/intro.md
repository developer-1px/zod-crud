# zod-crud

zod-crud는 **Zod schema로 보호되는 headless JSON tree editing layer**입니다.

JSON 문서를 편집하는 서비스가 매번 다시 만드는 선택, 편집, clipboard, undo/redo 규칙을 하나의 재사용 가능한 상태 계층으로 제공합니다. UI 컴포넌트, 키보드 매핑, DOM clipboard 호출은 애플리케이션이 맡고, zod-crud는 그 아래의 JSON 값, 작업, 선택, 히스토리, schema 검증을 다룹니다.

## 공식 계약

이 사이트의 설명은 `packages/zod-crud/SPEC.md`를 기준으로 합니다. SPEC은 코드, 문서, 테스트보다 우선하는 정본 계약입니다.

zod-crud의 본체는 다음 네 가지 축으로 닫힙니다.

- **Selection**: JSON Pointer 기반 선택과 검색
- **Edit**: JSON Patch 기반 이동, 복제, 교체
- **Clipboard**: JSON fragment의 cut, copy, paste
- **Undo**: JSON Patch inverse 기반 undo/redo

## 왜 필요한가요?

JSON 편집 UI는 간단한 `setState`로 시작할 수 있습니다.

```ts
setState({ ...state, title: "new title" });
```

하지만 실제 제품에서는 변경 규칙이 곧 데이터 계약이 됩니다.

- 변경 결과가 schema를 깨면 commit되면 안 됩니다.
- 항목을 삭제하거나 이동하면 selection도 같은 규칙으로 따라가야 합니다.
- undo/redo는 실제 적용된 JSON Patch와 역연산을 기준으로 쌓여야 합니다.
- React 화면, 서버, 테스트가 같은 변경 규칙을 공유해야 합니다.

zod-crud는 이 규칙을 UI 밖으로 분리합니다. 애플리케이션은 화면을 만들고, zod-crud는 문서 값과 편집 명령이 항상 같은 표준 위에서 움직이도록 관리합니다.

## React entry point

React에서 가장 높은 수준의 진입점은 `useJsonDocument`입니다.

```ts
const doc = useJsonDocument(Schema, initial, {
  history: 50,
  selection: { mode: "multiple" },
});
```

`doc`는 편집기 하나의 headless 상태 모델입니다.

| 필드 | 뜻 |
|------|----|
| `doc.value` | 현재 JSON 문서 값 |
| `doc.ops` | schema gate를 통과해 문서를 바꾸는 작업 |
| `doc.history` | undo/redo 상태와 명령 |
| `doc.selection` | 선택된 JSON Pointer 위치들 |

## Standards inside

zod-crud는 내부 표현을 임의 형식으로 만들지 않습니다.

- **RFC 6901 JSON Pointer**: 모든 좌표와 selection의 정본 path
- **RFC 6902 JSON Patch**: 모든 변경의 정본 operation
- **RFC 9535 JSONPath**: find/replace query 어휘
- **Zod schema**: commit 가능한 JSON 상태의 안전 경계

편집 작업은 먼저 계산되고, 결과가 Zod schema를 통과할 때만 commit됩니다. 실패하면 기존 state는 유지됩니다.

## What it is not

zod-crud는 form generator도, 완성형 JSON editor UI도 아닙니다.

- 버튼, input, tree row 같은 화면 요소를 제공하지 않습니다.
- DOM event와 keyboard shortcut을 자동으로 연결하지 않습니다.
- 브라우저 clipboard API를 직접 호출하지 않습니다.
- 시각적 selection이나 ARIA 속성 렌더링을 대신하지 않습니다.

이 경계를 유지하기 때문에 같은 편집 규칙을 React UI, headless 테스트, 서버 연동 코드에서 재사용할 수 있습니다.

## Start here

[Quick Start](/docs/getting-started)에서 작은 편집기를 만들고, [Core & Design](/docs/advanced)에서 SPEC 기반 내부 계약을 확인할 수 있습니다.
