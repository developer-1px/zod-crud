# 고급 옵션과 설계 선택

## 옵션

::source{path="packages/zod-crud/src/useJson.ts" title="UseJsonOptions"}

| 옵션 | 기본 | 의미 |
|------|------|------|
| `history` | `0` | undo/redo 스택 한계. `0` 이면 비활성, 비용 0 |
| `strict` | dev=`true`, prod=`false` | 위반 시 throw 여부 |
| `onError` | undefined | 위반 시 호출되는 콜백. strict 와 무관하게 항상 호출 |

## 빌드 타임 path 검증

::source{path="packages/zod-crud/src/core/path-types.ts" title="PointerOf / ValueAt"}

```ts
const [json, ops] = useJson(Schema, init);

ops.replace("/title", "ok")        // ✅
ops.replace("/title", 42)          // ❌ TS: number not assignable
ops.replace("/titel", "x")         // ❌ TS: 키 없음
ops.replace("/tasks/0/done", true) // ✅
```

깊이 한계는 5단입니다. 그 이상은 `string` fallback (TS 컴파일 비용 관리). depth 가 더 필요하면 batch (`ops.patch`) 로 우회.

## 외부 patch 적용

```ts
const patch: JsonPatchOperation[] = await fetchFromServer();
ops.patch(patch);
```

서버에서 만든 RFC 6902 patch 를 그대로 적용. 한 op 가 실패하면 state 변경 0 (G8).

## Pure core 직접 사용

::source{path="packages/zod-crud/src/core/patch.ts" title="applyOperation / applyPatch"}

React 와 무관하게 patch 적용:

```ts
import { applyPatch } from "zod-crud";

const r = applyPatch(Schema, state, ops);
if (r.result.ok) saveToDisk(r.state);
```

서버, Worker, 테스트, 다른 framework 어디서나 동일하게 동작합니다 (G6).

## 직렬화 헬퍼

::source{path="packages/zod-crud/src/core/serialize.ts" title="serialize / parse / safeParse"}

state 자체가 JSON 이라 별도 직렬화 단계가 거의 필요 없습니다. schema 검증을 끼우려면 `parse` / `safeParse` 사용.

## SPEC 변경 절차

라이브러리 동작 변경은 [`SPEC.md`](https://github.com/developer-1px/zod-crud/blob/main/packages/zod-crud/SPEC.md) 를 먼저 갱신한 뒤 코드를 따라가는 게 원칙입니다 (CONTRIBUTING.md 참조). §0.1 의 5대 원칙은 절대 변경되지 않습니다.
