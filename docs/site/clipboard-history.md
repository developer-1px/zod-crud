# 클립보드와 히스토리

## 클립보드는 라이브러리 책임이 아닙니다

SPEC §8 비-목표: zod-crud 는 selection model, focus management, multi-paste mode 같은 UI 어휘를 제공하지 않습니다. clipboard 동작은 RFC 6902 op 의 조합으로 사용자 코드에서 직접 구성합니다.

## copy / cut / duplicate — 6 op 조합

::source{path="apps/site/src/examples/ClipboardArray.tsx" title="ClipboardArray.tsx"}

| 동작 | 표준 표현 |
|------|-----------|
| copy → 끝 | `copy("/tasks/2", "/tasks/-")` |
| cut → 끝 | `patch([{ op: "copy", from: "/tasks/2", path: "/tasks/-" }, { op: "remove", path: "/tasks/2" }])` |
| duplicate | `copy("/tasks/2", "/tasks/-")` |
| 다른 영역으로 이동 | `move("/inbox/1", "/done/-")` |

복잡한 paste mode (sibling, child, overwrite) 는 사용자가 path 를 정확히 지정하면 됩니다 — 별도 모드 인자가 필요 없습니다.

## 외부와 patch 교환

RFC 6902 표준이라 서버·다른 클라이언트와 patch 그대로 주고받습니다.

```ts
fetch("/api/save", {
  method: "PATCH",
  headers: { "Content-Type": "application/json-patch+json" },
  body: JSON.stringify(operations),
});
```

서버에서는 fast-json-patch (Node), python-json-patch, json-patch (Ruby) 등 어떤 RFC 6902 구현을 써도 호환됩니다.

## History — opt-in

::source{path="packages/zod-crud/src/useJson.ts" title="useJson history"}

```ts
const [json, ops] = useJson(Schema, init, { history: 50 });
```

`history` 가 `0` 또는 미지정이면 비용 0. 활성 시 forward 와 inverse 가 RFC 6902 op 형식으로 스택에 쌓입니다.

| API | 의미 |
|-----|------|
| `ops.undo()` | 스택의 inverse 적용. boolean 반환 (적용 여부) |
| `ops.redo()` | redo 스택의 inverse 적용 |
| `ops.canUndo()` / `ops.canRedo()` | 현재 가능 여부 |

`load` / `reset` 은 history 를 clear 합니다 (외부 변경 적용은 history 와 별개).

## G7 — round-trip

```ts
ops.replace("/title", "x");
ops.undo();   // 원상태
ops.redo();   // 변경 후 상태
```

undo → redo 후 state 는 변경 후 상태와 deep-equal 입니다 (SPEC G7).
