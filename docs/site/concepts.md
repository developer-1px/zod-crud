# 핵심 개념

## State = JSON

`useJson(Schema, initial)` 가 반환하는 첫 번째 요소는 `z.output<Schema>` 그대로입니다. 내부 표현이 따로 없으므로 사용자는 그냥 객체로 읽고, `JSON.stringify(state)` 가 곧 직렬화입니다.

```ts
const [json, ops] = useJson(Schema, init);
console.log(json.title);          // 그냥 string
console.log(JSON.stringify(json)); // 그냥 JSON
```

이 설계의 비용은 op 적용 시 영향 받은 부모 체인을 spread 로 복제한다는 것입니다. 이득은 G1 (직렬화) · G2 (불변) · G3 (schema valid) · G6 (purity) 가 자동으로 따라온다는 것입니다.

## RFC 6901 Pointer

::source{path="packages/zod-crud/src/core/pointer.ts" title="parsePointer / buildPointer"}

path 는 항상 RFC 6901 문자열입니다. dotted (`a.b.c`), bracket (`a[0].b`), array shorthand (`["a", 0, "b"]`) 같은 편의 형식은 SPEC §0.1 (2) 로 금지됩니다 — 30년 호환을 위해 정본 1개만 허용합니다.

```
""              → root
"/title"        → state.title
"/tasks/0"      → state.tasks[0]
"/tasks/-"      → state.tasks 끝 (add 전용, RFC 6901 §4)
"/users/a~1b"   → state.users["a/b"]
```

## RFC 6902 6 op

::source{path="packages/zod-crud/src/core/patch.ts" title="applyOperation / applyPatch"}

모든 변경은 6 op 중 하나입니다. 추가 op 신설은 SPEC §3.3 에 의해 금지됩니다.

| op | 의미 |
|----|------|
| `add` | object key 생성 또는 array 위치 삽입. `/-` 는 끝 |
| `remove` | object key 또는 array element 제거 |
| `replace` | 기존 값 교체 (대상 존재 필수) |
| `move` | from 제거 → path 위치에 add. record key rename 도 포함 |
| `copy` | from 값 deep clone → path 위치에 add |
| `test` | path 값이 value 와 deep-equal 인지 검사. 실패 시 batch 롤백 |

## Pure core

`applyOperation` / `applyPatch` 는 React 의존이 0인 순수함수입니다. 같은 입력은 같은 출력을 반환하고 (SPEC G6), 서버·Worker·테스트 어디서나 import 가능합니다.

## Hook = setState wrapper

::source{path="packages/zod-crud/src/useJson.ts" title="useJson"}

훅 본체는 `useState(initial) + useMemo(ops, ...)` 만 합니다. 모든 mutation 은 `applyPatch` 를 호출해 다음 state 를 계산하고, 결과가 schema 를 통과하면 setState. 실패하면 state 변경 0 (SPEC G8 atomicity).

## 시끄러운 에러 (SPEC §6)

| 단계 | 시점 | 잡히는 위반 |
|------|------|-------------|
| TS 타입 | 빌드 | `PointerOf<T>` 가 path·value 타입 검증 |
| Pointer parse | dispatch 시작 | RFC 6901 형식 위반 |
| Path resolve | dispatch 시작 | replace/remove/test 대상 없음 |
| Schema validate | dispatch 후 | Zod 검증 실패 |

`strict` 옵션이 `true` (dev 기본) 이면 위반 시 `JsonCrudError` throw, `false` (prod 기본) 이면 `JsonResult` 반환 + `onError` 콜백.
