# UI Recipes — list / clipboard / history wiring

UI 이벤트를 `doc.ops`, `doc.selection`, `doc.history` 에 연결하는 레시피. 시나리오별 정본 카탈로그는 [Patterns](/docs/patterns), 거부한 기능 빈자리는 [Why Not](/docs/why-not).

## 패턴 1. 리스트 편집기

| UI 동작 | 연결할 API |
|---------|------------|
| input 변경 | `doc.ops.replace(path, value)` |
| 항목 추가 | `doc.ops.add("/items/-", item)` |
| 항목 삭제 | `doc.ops.remove("/items/0")` |
| 항목 이동 | `doc.ops.move(from, path)` |
| undo | `doc.commands.undo()` 또는 `doc.ops.undo()` |

리스트에서는 index가 바뀌기 쉽습니다. 그래서 selection과 캐럿을 직접 숫자로 들고 있기보다 Pointer로 들고 있는 편이 안전합니다.

## 패턴 2. 선택 가능한 리스트

여러 항목을 선택하려면 selection을 켭니다.

```ts
const doc = useJsonDocument(Schema, initial, {
  selection: { mode: "multiple" },
});
```

렌더링할 때는 각 항목이 선택됐는지 확인합니다.

```tsx
<li aria-selected={doc.selection?.containsNode(`/items/${i}`)}>
  {item.title}
</li>
```

클릭하면 toggle합니다.

```tsx
onClick={() => doc.selection?.toggleRange(`/items/${i}`)}
```

## 패턴 3. 캐럿이 있는 트리

트리 편집기는 “현재 활성 노드”가 필요합니다. 이때 selection을 켜고 collapsed selection을 캐럿으로 씁니다.

```ts
const doc = useJsonDocument(TreeSchema, initial, {
  selection: { mode: "extended", initial: [""] },
});
```

현재 캐럿은 JSON 위치 하나입니다.

```tsx
const active = doc.selection?.focus;
```

키보드 이벤트는 UI 책임입니다. Enter, Tab, Backspace 같은 키를 어떤 편집 작업으로 바꿀지는 앱이 결정합니다.

## 패턴 4. Outliner

::source{path="apps/site/src/routes/Outliner.tsx" title="Outliner route" lines="1-8"}

여기서 볼 점은 세 가지입니다.

1. 문서 값은 recursive JSON입니다.
2. 키보드 이벤트는 `doc.ops.patch`나 `doc.ops.move`로 변환됩니다.
3. selection focus와 history는 `doc` 안에서 함께 관리됩니다.

## 패턴 5. Clipboard UI

`doc.commands` 가 clipboard verb 를 제공합니다. `doc.ops` 로 JSON Patch 를 직접 적용해도 됩니다.

| UI 이름 | 실제 작업 |
|---------|-----------|
| duplicate | `doc.commands.duplicate(source)` |
| cut | `doc.commands.cut(source)` |
| copy | `doc.commands.copy(source)` |
| paste | `doc.commands.paste(payload, target)` |
| batch edit | `doc.ops.patch([...])` |

## 패턴 6. Session recording

`useRecorder`는 `doc.ops`에 subscribe해서 commit된 patch를 timestamp와 함께 모읍니다.
저장된 recording은 JSON으로 직렬화할 수 있고, `replayRecording`으로 다른 `ops` 인스턴스에 재생할 수 있습니다.

```ts
import { replayRecording, useRecorder } from "zod-crud";

const recorder = useRecorder(doc.ops);

recorder.start();
const recording = recorder.stop();
await replayRecording(recording, doc.ops, { speed: 1 });
```

## 좋은 패턴

- UI 이벤트는 앱에서 해석합니다.
- 문서 변경은 `doc.commands` 또는 `doc.ops`로만 합니다.
- 선택/캐럿은 JSON 위치로 저장합니다.
- schema가 실패하면 화면에 실패를 보여줍니다.
