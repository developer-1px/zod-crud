# zod-crud API

zod-crud는 Zod schema를 기준으로 JSON 문서를 읽고, 검증하고, 편집하는 headless API입니다. React가 없어도 같은 편집 모델을 쓸 수 있고, React에서는 같은 모델을 hook으로 받아 화면에 연결합니다.

## 먼저 잡아야 할 모델

- Schema가 계약입니다. 모든 편집은 Zod schema를 기준으로 검증됩니다.
- Pointer가 주소입니다. `/lists/0/cards/1/title` 같은 JSON Pointer로 문서 안의 위치를 가리킵니다.
- Patch가 변경 기록입니다. `add`, `remove`, `replace`, `move`, `copy`, `test`는 RFC 6902 JSON Patch operation입니다.
- Selection은 문서 위의 현재 선택입니다. 카드 하나, 여러 pointer, 텍스트 caret을 같은 selection 모델로 다룹니다.
- Command는 사용자 의도입니다. 버튼, 메뉴, 키보드 액션은 보통 `doc.commands`에 연결합니다.

## 시작 방식

React를 쓰지 않는 코드에서는 `createJSONDocument`를 사용합니다. 테스트, service layer, CLI, worker처럼 화면이 없는 곳에 맞습니다.

```ts
import { z } from "zod";
import { createJSONDocument } from "zod-crud";

const Card = z.object({
  id: z.string(),
  title: z.string().min(1),
});

const doc = createJSONDocument(Card, { id: "c1", title: "Draft" }, {
  history: 100,
  selection: true,
});

doc.ops.replace("/title", "Ready");
doc.commands.undo();
```

React component에서는 `useJSONDocument`를 사용합니다. 반환되는 `doc` 표면은 headless document와 같습니다.

```tsx
import { useJSONDocument } from "zod-crud/react";

function Editor() {
  const doc = useJSONDocument(Card, { id: "c1", title: "Draft" }, {
    history: 100,
    selection: { mode: "extended" },
  });

  return (
    <button onClick={() => doc.commands.replace("/title", "Ready")}>
      Replace title
    </button>
  );
}
```

## 공개 entrypoint

`zod-crud`는 React에 의존하지 않는 공개 표면입니다. 편집 모델, pointer helper, patch helper, headless factory는 여기서 가져옵니다.

```ts
import {
  JSONCrudError,
  createJSONDocument,
  createSelection,
  createClipboard,
  applyOperation,
  applyPatch,
  parsePointer,
  tryParsePointer,
  buildPointer,
  escapeSegment,
  unescapeSegment,
  PointerSyntaxError,
  parentPointer,
  lastSegment,
  lastSegmentIndex,
  appendSegment,
  withLastSegment,
  trackPointer,
  type JSONOps,
  type JSONDocument,
  type SelectionState,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
  type JSONPoint,
  type SelectionAction,
  type SelectionRange,
  type SelectionSnap,
} from "zod-crud";
```

`zod-crud/react`는 React hook만 노출합니다. React를 쓰지 않는 소비자가 React peer dependency를 끌고 오지 않게 분리되어 있습니다.

```ts
import { useJSONDocument } from "zod-crud/react";
```

## 중심 객체: JSONDocument<T>

`JSONDocument<T>`는 앱 코드가 가장 자주 만지는 객체입니다. 현재 값은 `doc.value`에서 읽고, 직접적인 patch는 `doc.ops`, 사용자 의도는 `doc.commands`, 실행 가능 여부는 `doc.check`와 `doc.can`에서 확인합니다.

```ts
type JSONDocument<T> = {
  readonly value: T;
  readonly lastPatch: readonly JSONPatchOperation[];
  readonly selection: SelectionState<T> | undefined;
  readonly history: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoDepth: number;
    readonly redoDepth: number;
    mergeLast(options?: { mergeKey?: string }): boolean;
    transaction(fn: () => void): void;
    transaction(options: HistoryTransactionOptions, fn: () => void): void;
  };
  readonly ops: JSONOps<T>;
  readonly commands: Commands<T>;
  readonly can: Can<T>;
  readonly check: Check<T>;
  readonly clipboard: ClipboardState<T>;
  readonly schema: SchemaState<T>;
  commit(ops: readonly JSONPatchOperation[], options?: CommitOptions): JSONResult;
  at(path: Pointer): ReadResult;
  exists(path: Pointer): boolean;
  query(jsonpath: string): QueryResult;
  entries(path: Pointer): EntriesResult;
};
```

읽기는 `doc.at`, `doc.exists`, `doc.query`, `doc.entries`로 합니다. 이 메서드들은 문서를 바꾸지 않습니다.

```ts
doc.at("/lists/0/cards/0/title");
doc.exists("/settings/archived");
doc.query("$..cards[?(@.status=='todo')]");
doc.entries("/lists/0/cards");
```

## 낮은 수준 mutation: JSONOps<T>

정확히 어떤 JSON Patch를 적용할지 알고 있을 때는 `doc.ops`를 사용합니다. `doc.ops`는 schema 검증, patch 적용, listener 알림, document history 연결을 통과합니다.

```ts
type JSONOps<T> = {
  add(path, value): JSONResult;
  remove(path): JSONResult;
  replace(path, value): JSONResult;
  move(from, path): JSONResult;
  copy(from, path): JSONResult;
  test(path, value): JSONResult;
  patch(ops, metadata?): JSONResult;
  load(value, options?): JSONResult;
  reset(value?): JSONResult;
  subscribe(listener): () => void;
  readonly state: T;
};
```

`add`, `remove`, `replace`, `move`, `copy`, `test`는 단일 operation에 대응합니다. 여러 operation을 한 번에 묶거나 history metadata를 붙여야 하면 `patch`를 사용합니다.

```ts
doc.ops.patch([
  { op: "replace", path: "/settings/owner", value: "playground" },
  { op: "replace", path: "/lists/0/name", value: "Backlog" },
], { label: "rename board", mergeKey: "rename" });
```

## 사용자 의도: Commands<T>

UI에서 사용자가 누르는 버튼은 대부분 `doc.commands`에 연결하는 편이 자연스럽습니다. command는 현재 selection을 source나 target으로 사용할 수 있고, `move`, `duplicate`, `paste` 같은 편집 의도를 patch로 바꿔 실행합니다.

```ts
type Commands<T> = {
  select(action, mode?): SelectionSnap;
  selectScope(options?): SelectionScopeResult;
  moveCursor(direction, options?): SelectionCursorResult;
  extendCursor(direction, options?): SelectionCursorResult;
  find(jsonpath): FindResult;
  move(fromOrTo, to?): MoveResult<T>;
  duplicate(sourceOrOpts?, opts?): DuplicateResult<T>;
  remove(source?): RemoveResult;
  replace(pathOrValue, value?): ReplaceResult<T>;
  replaceText(replacement, options?): ReplaceTextResult;
  deleteText(options?): DeleteTextResult;
  cut(source?): CutResult<T>;
  copy(source?): CopyResult;
  paste(payload, targetOrMode?, modeOrOptions?, options?): PasteResult<T>;
  undo(): boolean;
  redo(): boolean;
};
```

선택된 카드 삭제, 선택된 텍스트 교체, 현재 selection으로 복사 같은 동작은 source를 생략할 수 있습니다.

```ts
doc.commands.remove();
doc.commands.replaceText("Bench");
doc.commands.copy();
doc.commands.paste({ id: "new", title: "Inserted" }, "/lists/0/cards/-");
```

## SelectionState<T>

selection은 JSON 문서 위의 현재 선택 상태입니다. 단일 pointer 선택, 여러 pointer 선택, 텍스트 caret, anchor/focus range를 같은 snapshot으로 표현합니다.

```ts
type SelectionState<T> = SelectionSnap & {
  readonly rangeCount: number;
  readonly selectedCount: number;
  readonly hasSelection: boolean;
  readonly isCollapsed: boolean;
  readonly type: SelectionType;
  readonly primaryRange: SelectionRange | null;
  readonly anchorPointer: Pointer | null;
  readonly focusPointer: Pointer | null;
  readonly selectedSource: SelectionSource | null;
  readonly primaryPointer: Pointer | null;
  readonly caret: JSONPoint | null;
  readonly caretPointer: Pointer | null;
  readonly context: SelectionContext | undefined;
  collapse(point): void;
  setBaseAndExtent(anchor, focus): void;
  extend(point): void;
  addRange(pointOrRange): void;
  removeRange(pointOrRangeOrIndex): void;
  toggleRange(pointOrRange): void;
  togglePointer(pointer): void;
  moveCursor(direction, options?): SelectionCursorResult;
  extendCursor(direction, options?): SelectionCursorResult;
  resolveCursor(direction, options?): SelectionCursorResult;
  orderPrimaryRange(options?): SelectionRangeOrderResult;
  orderRanges(options?): SelectionRangesOrderResult;
  spansForPointer(pointer, options?): SelectionPointerSpansResult;
  textEdits(replacement, options?): SelectionTextEditsResult;
  textPatch(replacement, options?): ReplaceSelectionTextResult;
  deleteText(options?): DeleteSelectionTextResult;
  selectScope(options?): SelectionScopeResult;
  resolveScope(options?): SelectionScopeTarget;
  selectRanges(ranges, anchor?, focus?, primaryIndex?): void;
  setContext(context): void;
  clearContext(): void;
  empty(): void;
  isSelected(pointer): boolean;
  snapshot(): SelectionSnap;
  toJSON(): SelectionSnap;
  restore(snapshot): void;
  subscribe(listener): () => void;
};
```

multi-select UI에서는 `collapse`, `togglePointer`, `setBaseAndExtent`, `selectRanges`가 주로 쓰입니다. history나 외부 상태와 동기화할 때는 `snapshot`과 `restore`를 사용합니다.

## ClipboardState<T>

clipboard는 문서 내부 buffer입니다. browser clipboard가 아니라 JSON payload와 source pointer를 함께 기억하는 편집용 clipboard입니다.

```ts
type ClipboardState<T> = {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: readonly Pointer[] | null;
  read(): ClipboardReadResult;
  write(payload, options?): JSONResult;
  clear(): void;
  copy(source?): CopyResult;
  cut(source?): CutResult<T>;
  paste(targetOrMode?, modeOrOptions?, options?): ClipboardPasteResult<T>;
};
```

source를 넘기지 않으면 현재 selection을 source로 씁니다. paste target도 생략하면 selection에서 target을 찾습니다.

```ts
doc.clipboard.copy();
doc.clipboard.paste("/lists/1/cards/0", "after");
doc.clipboard.write({ id: "x", title: "Manual" }, { source: "/lists/0/cards/0" });
```

## 실행 전 확인: Check, Can, SchemaState

실행 전에 가능한지 확인하는 표면입니다. `doc.check`는 실패 이유를 돌려주고, `doc.can`은 UI disabled 처리에 쓰기 좋은 boolean만 돌려줍니다.

```ts
type Check<T> = {
  selectScope(options?): CheckResult;
  moveCursor(direction, options?): CheckResult;
  extendCursor(direction, options?): CheckResult;
  find(jsonpath): CheckResult;
  move(fromOrTo, to?): CheckResult;
  duplicate(sourceOrOpts?, opts?): CheckResult;
  remove(source?): CheckResult;
  replace(pathOrValue, value?): CheckResult;
  replaceText(replacement, options?): CheckResult;
  deleteText(options?): CheckResult;
  cut(source?): CheckResult;
  copy(source?): CheckResult;
  paste(payload, targetOrMode?, modeOrOptions?, options?): CheckResult;
  patch(ops): CheckResult;
  readonly undo: CheckResult;
  readonly redo: CheckResult;
};

type Can<T> = {
  selectScope(options?): boolean;
  moveCursor(direction, options?): boolean;
  extendCursor(direction, options?): boolean;
  find(jsonpath): boolean;
  move(fromOrTo, to?): boolean;
  duplicate(sourceOrOpts?, opts?): boolean;
  remove(source?): boolean;
  replace(pathOrValue, value?): boolean;
  replaceText(replacement, options?): boolean;
  deleteText(options?): boolean;
  cut(source?): boolean;
  copy(source?): boolean;
  paste(payload, targetOrMode?, modeOrOptions?, options?): boolean;
  readonly undo: boolean;
  readonly redo: boolean;
};
```

`doc.schema`는 pointer 위치의 schema 정보를 읽습니다. form builder, inspector, insert menu에서 유용합니다.

```ts
type SchemaState<T> = {
  at(path, mode?): SchemaQueryResult;
  kind(path, mode?): SchemaKindResult;
  accepts(path, value, mode?): CheckResult;
  describe(path, mode?): SchemaDescriptionResult;
};

doc.schema.kind("/lists/0/cards/-", "insert");
doc.schema.accepts("/lists/0/cards/-", candidateCard, "insert");
```

## pure helper

문서 객체 없이 순수 함수만 쓰고 싶을 때도 있습니다. 테스트, migration, server-side validation에서는 `applyPatch`, `applyOperation`, pointer helper를 직접 사용합니다.

```ts
const patch = [
  { op: "replace", path: "/title", value: "Ready" },
];

const result = applyPatch(BoardSchema, board, patch);
const pointer = buildPointer(["lists", 0, "cards", 0]);
const parent = parentPointer("/lists/0/cards/0/title");
const tracked = trackPointer("/lists/0/cards/1/title", patch);
```

## 무엇을 고르면 되나

- 정확한 patch를 알고 있으면 `doc.ops`를 사용합니다.
- 사용자 액션을 구현하면 `doc.commands`를 사용합니다.
- 버튼 disabled나 preflight가 필요하면 `doc.can` 또는 `doc.check`를 사용합니다.
- pointer 위치의 타입 정보를 UI에 보여주면 `doc.schema`를 사용합니다.
- React 밖에서 같은 편집 모델이 필요하면 `createJSONDocument`를 사용합니다.
- React component 안에서는 `useJSONDocument`를 사용합니다.
