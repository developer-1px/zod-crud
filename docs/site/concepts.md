# useJsonDocument

`useJsonDocument`는 zod-crud의 중심 hook입니다. 사용자가 처음 만나는 제품 표면이고, 내부적으로는 낮은 레벨 hook들을 묶어 하나의 문서 편집기 상태 객체를 만듭니다.

## 반환값은 하나의 `doc` 객체입니다

```ts
const doc = useJsonDocument(Schema, initial);
```

`doc`는 편집 중인 JSON 문서 하나를 나타냅니다.

| 필드 | 설명 |
|------|------|
| `doc.value` | 현재 문서 값 |
| `doc.ops` | 문서를 바꾸는 작업 API |
| `doc.history` | undo/redo API |
| `doc.selection` | 선택 상태. 옵션을 켰을 때 사용 |
| `doc.focus` | 포커스 상태. 옵션을 켰을 때 사용 |

## `doc.value`

`doc.value`는 schema를 통과한 JSON 값입니다. 특별한 class가 아니라 평범한 객체입니다.

```tsx
<h1>{doc.value.title}</h1>
```

읽을 때는 그냥 React state처럼 읽으면 됩니다. 직접 수정하지 말고, 변경할 때는 `doc.ops`를 사용합니다.

## `doc.ops`

`doc.ops`는 문서를 바꾸는 함수들입니다.

```ts
doc.ops.replace("/title", "New title");
doc.ops.add("/tasks/-", { text: "new task", done: false });
doc.ops.remove("/tasks/0");
```

여기서 `"/title"`이나 `"/tasks/0"`은 문서 안의 위치입니다. 처음에는 파일 경로처럼 “어디를 바꿀지 적는 문자열”이라고 생각하면 됩니다.

## `doc.history`

history는 undo/redo를 담당합니다.

```tsx
const doc = useJsonDocument(Schema, initial, { history: 100 });

doc.history.undo();
doc.history.redo();
doc.history.canUndo;
doc.history.canRedo;
```

history를 켜지 않으면 undo/redo 스택은 쌓이지 않습니다.

## `doc.selection`

selection은 “선택된 위치들”입니다. 리스트나 트리 편집기에서 여러 항목을 선택할 때 씁니다.

```ts
const doc = useJsonDocument(Schema, initial, {
  selection: { mode: "multiple" },
});

doc.selection?.toggle("/tasks/2");
doc.selection?.has("/tasks/2");
```

selection은 Pointer 배열로 저장됩니다. 즉 선택된 DOM element가 아니라 선택된 JSON 위치를 기억합니다.

## `doc.focus`

focus는 “현재 활성 위치”입니다. 키보드 조작의 기준이 되는 항목을 표현할 때 씁니다.

```ts
const doc = useJsonDocument(Schema, initial, {
  focus: { initial: "/tasks/0" },
});

doc.focus?.set("/tasks/1");
doc.focus?.clear();
```

항목이 이동하거나 삭제되면 focus는 변경을 따라갑니다. 삭제된 위치를 어떻게 복구할지는 `recover` 옵션으로 정할 수 있습니다.

## 옵션 전체

| 옵션 | 설명 |
|------|------|
| `history` | undo/redo 스택 크기 |
| `strict` | 실패 시 throw할지 여부 |
| `onError` | 실패했을 때 호출할 콜백 |
| `selection` | 선택 상태 켜기와 설정 |
| `focus` | 포커스 상태 켜기와 설정 |

## 언제 낮은 레벨 hook을 쓰나요?

대부분의 앱은 `useJsonDocument`로 시작하면 됩니다.

낮은 레벨 hook은 이런 경우에 씁니다.

- selection과 focus를 완전히 다른 컴포넌트 경계에서 따로 관리하고 싶을 때
- React 밖에서 core만 쓰고 싶을 때
- document facade 없이 `useJson`만 가볍게 쓰고 싶을 때

그 전까지는 `useJsonDocument`를 기본값으로 두는 편이 이 프로젝트의 의도에 맞습니다.

## 타입 표면

전체 구현보다 먼저 타입 표면만 보면 충분합니다.

::source{path="packages/zod-crud/src/hooks/useJsonDocument.ts" title="useJsonDocument types" lines="12-37"}
