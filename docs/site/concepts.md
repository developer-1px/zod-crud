# 핵심 개념

이 문서는 zod-crud를 처음 배우는 사람이 꼭 알아야 할 단어를 정리합니다. 어려운 부분은 세 가지뿐입니다.

- JSON Pointer: 어디를 바꿀지 가리키는 문자열
- JSON Patch: 어떻게 바꿀지 말하는 작업
- Schema validation: 바꾼 결과가 맞는지 확인하는 검사

## State는 그냥 JSON입니다

`useJson(Schema, initial)`이 반환하는 첫 번째 값은 특별한 class가 아닙니다. 그냥 객체입니다.

```ts
const [json, ops] = useJson(Schema, initial);

json.title;
json.tasks[0];
JSON.stringify(json);
```

이 점이 중요합니다. 저장, 복사, 서버 전송, SSR hydration, Worker 메시지 전달을 할 때 별도 변환이 필요 없습니다.

## Pointer는 “주소”입니다

JSON 안의 위치는 RFC 6901 JSON Pointer로 씁니다.

::source{path="packages/zod-crud/src/core/pointer.ts" title="pointer helpers" lines="1-29"}

자주 쓰는 예시는 다음과 같습니다.

| Pointer | 의미 |
|---------|------|
| `""` | root 전체 |
| `"/title"` | `state.title` |
| `"/tasks/0"` | `state.tasks[0]` |
| `"/tasks/-"` | 배열 끝. `add`에서만 사용 |
| `"/users/a~1b"` | `state.users["a/b"]` |
| `"/users/a~0b"` | `state.users["a~b"]` |

`.`으로 잇는 `tasks.0.title`도, bracket을 쓰는 `tasks[0].title`도 사용하지 않습니다. 오래 가는 API에서는 주소 형식이 하나여야 합니다.

## Patch는 “명령”입니다

JSON Patch는 6개 operation만 가집니다.

| op | 설명 |
|----|------|
| `add` | object key를 만들거나 배열에 삽입합니다 |
| `remove` | 값을 제거합니다 |
| `replace` | 이미 있는 값을 교체합니다 |
| `move` | 한 위치에서 제거한 뒤 다른 위치에 추가합니다 |
| `copy` | 값을 복제해서 다른 위치에 추가합니다 |
| `test` | 값이 기대와 같은지 확인합니다 |

zod-crud는 `set`, `insert`, `delete`, `rename`, `paste` 같은 별도 alias를 만들지 않습니다. 모두 위 6개 operation 조합으로 표현합니다.

## Schema는 마지막 문지기입니다

operation 자체가 문법적으로 맞아도 결과가 schema를 깨면 commit되지 않습니다.

예를 들어 `title`이 string이어야 하는데 number를 넣으면 실패합니다.

```ts
const result = ops.replace("/title", 123 as never);

if (!result.ok) {
  result.code; // "schema_violation"
}
```

이때 state는 그대로 유지됩니다. 실패한 변경이 반쯤 적용되는 일은 없습니다.

## Pure core와 React hook

코어 함수는 React를 모릅니다.

::source{path="packages/zod-crud/src/core/patch.ts" title="applyOperation / applyPatch" lines="274-329"}

React hook은 이 코어를 감싸서 `setState`와 history, listener notification을 붙입니다.

::source{path="packages/zod-crud/src/useJson.ts" title="useJson surface" lines="21-46"}

이 구조 덕분에 같은 작업 모델을 브라우저 UI, 서버 검증, 테스트 코드에서 함께 사용할 수 있습니다.

## Axis 2: selection과 focus

문서 편집기를 만들면 “지금 선택된 항목”과 “키보드 포커스가 있는 항목”이 필요합니다. zod-crud는 이것도 Pointer로 표현합니다.

```ts
const selection = useSelection(ops, { mode: "multiple" });
const focus = useFocus(ops);

selection.toggle("/tasks/2");
focus.set("/tasks/2");
```

그 뒤 `/tasks/0`이 삭제되면 기존 `/tasks/2`는 자동으로 `/tasks/1`로 따라갑니다. 이 자동 추적이 Axis 2의 핵심입니다.
