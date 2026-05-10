# Editor State

편집기는 단순히 값 하나만 들고 있지 않습니다. 사용자가 보고 있는 문서 값, 방금 한 편집, 선택된 항목, 캐럿, 되돌리기 기록이 함께 움직입니다.

zod-crud는 이 묶음을 `doc` 객체로 다룹니다. `doc.ops`는 JSON Patch에 가까운 저수준 표면이고, `doc.commands`는 제품 기능으로 바로 부르기 좋은 명령 표면입니다.

## 문서 값

문서 값은 `doc.value`입니다.

```ts
doc.value;
```

이 값은 항상 schema를 통과한 JSON입니다. 편집 실패가 발생하면 `doc.value`는 바뀌지 않습니다.

## 편집 작업

기본 편집은 `doc.ops`로 합니다.

```ts
doc.ops.replace("/title", "New title");
doc.ops.add("/items/-", item);
doc.ops.remove("/items/0");
doc.ops.move("/items/2", "/items/0");
```

입문 단계에서는 operation 이름을 이렇게 이해하면 됩니다.

| 작업 | 언제 쓰나요? |
|------|--------------|
| `replace` | 이미 있는 값을 바꿀 때 |
| `add` | 새 값을 넣을 때 |
| `remove` | 값을 지울 때 |
| `move` | 위치를 옮길 때 |
| `copy` | 복제할 때 |
| `test` | 바꾸기 전에 값이 맞는지 확인할 때 |
| `patch` | 여러 작업을 한 번에 적용할 때 |

## 명령 표면

공식 편집 어휘는 `doc.commands`에 모입니다.

```ts
doc.commands.find("$..title");
doc.commands.move("/items/2", "/items/0");
doc.commands.duplicate("/items/0");
doc.commands.cut("/items/1");
doc.commands.copy("/items/1");
doc.commands.paste(payload, "/items/-");
doc.commands.undo();
doc.commands.redo();
```

버튼을 만들 때는 `doc.can`으로 현재 state에서 가능한 작업인지 확인합니다.

```tsx
<button disabled={!doc.can.paste(payload, "/items/-")}>
  paste
</button>
```

## 여러 작업을 한 번에 적용하기

가끔 편집 하나가 여러 단계로 이루어집니다. 예를 들어 버전을 확인하고 제목을 바꾸고 로그를 추가할 수 있습니다.

```ts
doc.ops.patch([
  { op: "test", path: "/version", value: 1 },
  { op: "replace", path: "/title", value: "Saved" },
  { op: "add", path: "/logs/-", value: "saved title" },
]);
```

중간에 하나라도 실패하면 전체가 취소됩니다. 이것을 atomic하다고 말합니다. 입문자 관점에서는 “반쯤만 바뀌는 일이 없다”고 이해하면 됩니다.

## 선택 상태

selection은 사용자가 선택한 JSON 위치들입니다.

```ts
doc.selection?.setBaseAndExtent("/items/0", "/items/1");
doc.selection?.toggleRange("/items/2");
doc.selection?.empty();
```

선택 상태는 UI와 분리되어 있습니다. DOM node를 저장하지 않고 JSON 문서 안의 위치를 저장합니다.

## 캐럿 상태

캐럿은 collapsed selection입니다. 현재 키보드 조작의 기준이 되는 위치는 `selection.focus`입니다.

```ts
doc.selection?.collapse("/items/0");
doc.selection?.empty();
```

트리나 아웃라이너에서는 “현재 커서가 있는 노드”라고 생각하면 됩니다.

## 변경을 따라가는 좌표

배열에서 `/items/0`을 삭제하면 원래 `/items/2`였던 항목은 `/items/1`이 됩니다. selection의 range, anchor, focus는 이런 변경을 자동으로 따라갑니다.

```ts
doc.selection?.collapse("/items/2");
doc.ops.remove("/items/0");
// selection.focus는 /items/1 쪽으로 이동
```

이 동작 때문에 사용자는 매번 “삭제했으니 선택 index를 하나 줄여야 하나?” 같은 코드를 직접 쓰지 않아도 됩니다.

## 히스토리

history는 문서 편집을 되돌리고 다시 적용합니다.

```ts
doc.commands.undo();
doc.commands.redo();
```

버튼에는 `canUndo`, `canRedo`를 연결합니다.

```tsx
<button disabled={!doc.history.canUndo} onClick={doc.commands.undo}>
  undo
</button>
```

`doc.ops.undo()`와 `doc.ops.redo()`도 같은 history stack을 사용합니다. `doc.history`는 실행 함수가 아니라 상태와 `mergeLast()`를 제공하는 표면입니다.

## 실전 시나리오

### Dict-record 의 한 키 쓰기

`z.record(z.string(), V)` 스키마에서 키 한 개만 변경할 때는 **path 를 직접 가리키세요**. 전체 dict 를 spread 해 통째로 replace 하면 한 키 변경 의도가 “dict 전체 교체” history entry 가 됩니다.

```ts
// ✅ canonical — surgical, 한 path 만 history entry
const writeCell = (k: string, v: string) => {
  if (v === '' && cells[k] !== undefined) ops.remove(`/cells/${k}`);
  else if (v !== '' && cells[k] === undefined) ops.add(`/cells/${k}`, v);
  else if (v !== '' && cells[k] !== v) ops.replace(`/cells/${k}`, v);
};

// ❌ anti-pattern — 전체 dict spread 후 replace
ops.replace('/cells', { ...cells, [k]: v });
```

dynamic record key 도 `as never` 없이 typecheck 통과합니다 (issue #52 회귀 가드 기준).

### Drag / keystroke burst — undo entry 폭증 방지

drag mousemove 마다 ops 를 호출하면 단일 동작이 100+ history entry 로 분할됩니다. 두 가지 정본 패턴:

**Pattern A — local React state preview, drop 시 한 번만 commit (권장)**

```tsx
const [liveWidth, setLiveWidth] = useState<number | null>(null);

const onMouseMove = (e) => setLiveWidth(start + (e.clientX - startX));
const onMouseUp = () => {
  if (liveWidth !== null) ops.replace('/colWidths/A', liveWidth);
  setLiveWidth(null);
};

// 렌더: liveWidth ?? widths.A
```

transient UI state(드래그 미리보기) 와 committed model state 를 분리하는 표준 React 패턴. 한 번의 drop 이 단일 undo entry.

**Pattern B — `history.mergeLast()` 로 burst 후 직전 entry 합치기**

```ts
ops.replace('/blocks/0/text', 'h');
ops.replace('/blocks/0/text', 'hi');
ops.replace('/blocks/0/text', 'hil');
doc.history.mergeLast();  // 임의 횟수 반복 호출 가능 → 1 history step
```

키스트로크 burst, 자동완성 적용 등 commit 후에야 “합치는 게 맞다” 가 결정되는 경우. mergeLast 는 직전 두 entry 를 한 entry 로 합칩니다.

## 핵심 요약

사용자에게 가까운 모델은 이것입니다.

```txt
doc
├─ value      현재 문서
├─ ops        JSON Patch에 가까운 저수준 작업
├─ commands   제품 수준 편집 명령
├─ can        명령 실행 가능 여부
├─ history    되돌리기 가능 상태
└─ selection  선택된 위치들. collapsed selection이면 현재 캐럿
```

내부에서 이것이 JSON Pointer와 JSON Patch로 표현된다는 사실은 나중에 알아도 됩니다.
