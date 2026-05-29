# Selection Contract

상태: 1.0 semantic freeze 기준.

Selection은 DOM focus나 화면 highlight가 아니라 JSON document 위의 headless
주소 상태다. 앱은 이 상태를 사용해 keyboard focus, row focus, visual handles,
text caret, review marker를 투영할 수 있지만, core selection 자체는 UI를
소유하지 않는다.

## 규범

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY`는 규범 키워드다.

Selection snapshot은 JSON-serializable이어야 한다. Public selection API는 JSON
Pointer를 주소로 사용해야 하며, DOM node, React ref, layout coordinate를
저장하면 안 된다.

## SelectionMode

`SelectionMode`는 reducer가 selection을 정규화하는 방식을 정한다.

| Mode | 의미 |
| --- | --- |
| `single` | 마지막 target 하나만 유지한다 |
| `multiple` | 여러 collapsed range 또는 range를 유지한다 |
| `extended` | `multiple`과 같은 다중 selection 표면을 제공하며 anchor/focus 확장 흐름에 쓴다 |

Mode는 UI keyboard policy가 아니다. `shift`, `cmd`, `ctrl` 같은 host gesture는
앱이나 adapter가 action으로 번역한다.

## SelectionPoint

Selection point는 pointer 문자열 또는 point object다.

```ts
type SelectionPoint =
  | Pointer
  | {
      path: Pointer;
      offset?: number;
      edge?: "before" | "after";
      affinity?: "forward" | "backward";
    };
```

`path`는 JSON Pointer다. `offset`은 string이나 host-defined ordered scope에서
위치를 표현할 때 쓸 수 있다. `edge`와 `affinity`는 같은 pointer 안에서 caret
또는 boundary 방향을 복원하기 위한 hint다.

## SelectionRange

Selection range는 anchor와 focus를 가진다.

```ts
type SelectionRange = {
  anchor: SelectionPoint;
  focus: SelectionPoint;
};
```

Collapsed selection은 anchor와 focus가 같은 pointer를 가리키는 range다. Range가
가리키는 pointer 목록은 document traversal과 값 종류에 따라 확장될 수 있다.

## SelectionSnap

`SelectionSnap`은 selection의 stable serialized form이다.

```ts
type SelectionSnap = {
  selectedPointers: Pointer[];
  selectionRanges: SelectionRange[];
  primaryIndex: number;
  anchor: SelectionPoint | null;
  focus: SelectionPoint | null;
  context?: JSONValue;
};
```

필드 의미는 다음과 같다.

| Field | 의미 |
| --- | --- |
| `selectedPointers` | bulk command, clipboard, query 결과 투영에 쓰는 ordered pointer set |
| `selectionRanges` | anchor/focus 보존이 필요한 range 목록 |
| `primaryIndex` | primary range index. empty selection은 `-1` |
| `anchor` | primary range의 anchor. empty selection은 `null` |
| `focus` | primary range의 focus. empty selection은 `null` |
| `context` | 앱이 복원하고 싶은 JSON-serializable selection context |

`selectedPointers`는 중복 없이 정규화되어야 한다. `selectionRanges`가 비어 있으면
selection은 empty이며 `primaryIndex`는 `-1`, `anchor`와 `focus`는 `null`이어야
한다.

## Action Semantics

Selection action은 snapshot을 새 snapshot으로 줄이는 pure 의미론을 가져야 한다.

| Action | 의미 |
| --- | --- |
| `collapse` | 한 point로 collapsed selection을 만든다 |
| `setBaseAndExtent` | anchor와 focus로 range를 만든다 |
| `extend` | 기존 anchor에서 새 focus로 확장한다 |
| `addRange` | range를 추가하고 primary로 만든다 |
| `removeRange` | range, point, index 중 하나에 맞는 range를 제거한다 |
| `toggleRange` | 같은 range가 있으면 제거하고 없으면 추가한다 |
| `togglePointer` | pointer collapsed range를 toggle한다 |
| `selectRanges` | range 목록을 한 번에 설정한다 |
| `empty` | empty selection으로 만든다 |
| `setContext` | JSON context를 저장한다 |
| `clearContext` | context를 제거한다 |

`single` mode에서는 action 결과가 항상 마지막 range 하나로 정규화되어야 한다.
`multiple`과 `extended` mode에서는 중복 range를 제거하고 primary range를 유지해야
한다.

## Patch Tracking

Document patch 이후 selection은 다음 순서로 결정된다.

1. Mutation metadata가 explicit final selection인 `selectionAfter`를 제공하면
   그 snapshot을 복원한다.
2. 제공하지 않으면 applied JSON Patch operation으로 기존 pointer를 track한다.
3. `add`, `copy`, `move`가 새 target을 만들면 auto target selection을 만들 수
   있다.
4. 살아남은 pointer는 보존한다.
5. 제거된 pointer는 recovery target이 있으면 재지정하고, 없으면 제거한다.

Structural command extension은 앱 의도를 가장 잘 아는 위치에 있으므로
`selectionAfter`를 제공하는 편이 좋다. Core auto tracking은 일반 patch에 대한
fallback이다.

Patch와 `selectionAfter`는 같은 history entry에 원자적으로 기록되어야 한다.
실패한 mutation은 selection을 바꾸면 안 된다.

## Cursor, Scope, Order

Cursor와 scope API는 pointer traversal 위에서 동작한다.

| Code | 의미 |
| --- | --- |
| `invalid_pointer` | scope pointer 문법이 잘못됨 |
| `path_not_found` | scope 또는 point target이 없음 |
| `syntax_error` | traversal input 문법 오류 |
| `empty_scope` | scope 안에 움직일 point가 없음 |
| `cursor_boundary` | first/last 경계에서 더 이동할 수 없음 |
| `point_not_in_order` | anchor/focus point가 traversal order에 없음 |
| `empty_selection` | order 작업에 필요한 selection이 없음 |

Cursor 실패 result는 기존 selection snapshot을 함께 반환해야 한다. 실패한 cursor
move가 selection을 바꾸면 안 되기 때문이다.

## Text Selection Editing

Text edit helper는 string 값 위의 headless selection replacement다.

텍스트 replacement는 한 range가 하나의 pointer 안에 있어야 한다. 여러 pointer를
가로지르는 rich text editing, mark formatting, inline decoration은 core
selection의 책임이 아니다.

Text edit 실패 code는 다음을 포함할 수 있다.

| Code | 의미 |
| --- | --- |
| `missing_length` | point offset 계산에 필요한 string 길이가 없음 |
| `multi_pointer_range` | range가 여러 pointer를 가로지름 |
| `overlapping_ranges` | replacement range가 겹침 |
| `cursor_boundary` | collapsed deletion이 string 경계를 넘음 |
| `path_not_found` | target pointer가 없음 |
| `not_string` | target 값이 string이 아님 |

## Non-goals

Selection contract는 다음을 제공하지 않는다.

- DOM focus ownership.
- row focus와 keyboard roving tabindex.
- 2D marquee, geometry, resize handles.
- rich text mark formatting.
- stable object id resolver.
- collaborative presence protocol.

이 기능들은 public selection snapshot과 pointer tracking 위에 adapter나 extension이
구현할 수 있다.

## Breaking Change

다음 변경은 1.0 이후 breaking change다.

- `SelectionSnap` 필드 제거 또는 의미 변경.
- empty selection의 `primaryIndex: -1` 규칙 변경.
- `single` mode가 여러 range를 유지하도록 변경.
- mutation failure가 selection을 변경하도록 변경.
- explicit `selectionAfter`보다 auto tracking을 우선하도록 변경.
- selection error code 제거, rename, 의미 변경.

