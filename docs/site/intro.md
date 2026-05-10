# Overview

zod-crud는 **Zod schema로 보호되는 JSON editor state layer**입니다.

조금 풀어서 말하면, JSON으로 된 문서를 편집하는 화면을 만들 때 필요한 상태 관리를 대신 맡아주는 headless 라이브러리입니다. headless라는 말은 버튼, input, tree row 같은 UI 모양은 제공하지 않고, 그 아래에서 움직이는 상태와 작업만 제공한다는 뜻입니다.

## 어떤 문제를 해결하나요?

JSON 편집 UI는 처음에는 쉬워 보입니다.

```ts
setState({ ...state, title: "new title" });
```

하지만 실제 편집기를 만들면 금방 복잡해집니다.

- 값이 schema를 깨면 저장하면 안 됩니다.
- 항목을 삭제하면 선택된 위치도 같이 움직여야 합니다.
- 항목을 이동하면 focus도 새 위치를 따라가야 합니다.
- undo/redo가 필요합니다.
- 서버나 테스트에서는 React 없이 같은 변경 규칙을 쓰고 싶습니다.

zod-crud는 이 문제를 한 곳에 모읍니다. 사용자는 UI를 만들고, zod-crud는 문서 값, 편집 작업, 선택, 포커스, 히스토리를 안전하게 관리합니다.

## 가장 중요한 API

처음 만날 API는 `useJsonDocument`입니다.

```ts
const doc = useJsonDocument(Schema, initial, {
  history: 50,
  focus: true,
  selection: { mode: "multiple" },
});
```

`doc`는 편집기 하나의 상태 모델입니다.

| 필드 | 뜻 |
|------|----|
| `doc.value` | 현재 JSON 문서 값 |
| `doc.ops` | 문서를 바꾸는 작업들 |
| `doc.history` | undo/redo |
| `doc.selection` | 선택된 JSON 위치들 |
| `doc.focus` | 현재 활성 JSON 위치 |

## Zod는 무엇을 하나요?

Zod schema는 이 편집기가 다룰 수 있는 문서의 모양입니다.

```ts
const Todo = z.object({
  title: z.string(),
  done: z.boolean(),
});
```

편집 작업이 끝난 뒤 결과가 schema를 통과하면 commit됩니다. 통과하지 못하면 state는 바뀌지 않습니다. 그래서 zod-crud에서 Zod는 단순한 검증 도구가 아니라, 편집 가능한 세계의 안전 경계입니다.

## 내부 표준은 뒤에서 배웁니다

zod-crud 내부는 JSON Pointer와 JSON Patch 위에 있습니다. 하지만 처음부터 이 단어를 외울 필요는 없습니다.

처음에는 이렇게만 기억하면 됩니다.

- `doc.value`를 읽습니다.
- `doc.ops`로 편집합니다.
- Zod가 안전하지 않은 변경을 막습니다.
- selection/focus/history가 편집을 따라갑니다.

나중에 서버 연동, 외부 patch, core API가 필요해지면 [Core & Design](/docs/advanced)에서 내부 계약을 보면 됩니다.

## 다음에 읽을 것

[Quick Start](/docs/getting-started)에서 아주 작은 편집기를 만들어 봅니다.
