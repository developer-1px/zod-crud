# apps/outliner — Specification

zod-crud 의 첫 번째 reference editor. `useJsonDocument` facade 와 outliner-local 모듈
(`keymap`, `clipboard`, `commands`) 를 합쳐 5축(키보드 · cursor · multi-select · clipboard ·
error) 을 모두 구현한 Workflowy/Roam 풍 outliner.

이 SPEC 은 **outliner 자체의 규약**이다. zod-crud SPEC.md 가 변하지 않는 30년 락인이라면,
이 SPEC 은 reference editor 라 진화 가능하다 (이 문서가 변하면 zod-crud SPEC 은 흔들리지
않아야 한다 — 의존 방향: outliner → zod-crud).

---

## 0. 헌장

- zod-crud 가 제공하는 `useJsonDocument` facade 위에서만 동작한다.
- 100% JSON 직렬화 (G1) — outliner 의 모든 상태 (selection · focus · clipboard buffer ·
  history) 가 `JSON.stringify` round-trip.
- DOM 이벤트 → chord → command → RFC 6902 batch 의 단방향 흐름.
- 사용자 한 동작(키 한 번 누르기) = 한 RFC 6902 batch = 한 history 항목 = 한 React render.

## 1. Schema

```ts
type OutlineNode = { text: string; children: OutlineNode[] };
```

재귀. Zod 에서 `get children()` lazy. 빈 노드 = `{ text: "", children: [] }`.

## 2. Keyboard SSOT

[`src/keymap.ts`](./src/keymap.ts) 가 정본.

```ts
{ chord: "Tab", command: "demote", label: "Demote" }
```

- `chord` — `eventToChord(KeyboardEvent)` 가 정규화. `Mod` = macOS 의 Cmd, 그 외 Ctrl.
- `command` — `CommandId` union (현재 14개).
- `label` — 메뉴 / 팔레트 / 도움말 표시용.

DOM 이벤트는 `eventToChord` 로 정규화 → `findCommand(chord)` 로 lookup → `dispatch(id)`.
chord 가 keymap 에 없으면 default 동작 통과 (텍스트 입력 등).

## 2.5 Mode — select / edit (Workflowy 모델)

이 outliner 는 **두 모드**를 분리한다. 표준 role model = Workflowy / Roam / LogSeq 의 정통 outliner 패턴 (Notion·VSCode·Excel 도 동일 2-mode 패턴).

| Mode | DOM | Arrow keys | Enter | Esc | 외형 |
|------|-----|------------|-------|-----|------|
| `select` | input readOnly, focus 유지 | row navigation | edit mode 진입 | (no-op) | 파란 배경 |
| `edit` | input editable, caret 보임 | caret 이동 (DOM 기본) | insert sibling + 새 row 도 edit | select mode 로 escape | 흰 배경 + 파란 outline |

기본 모드 = `select`. 진입 트리거:
- click 텍스트 → `edit`
- click 불릿 → `select`
- Enter (in select) → `edit`
- insert-sibling 자동 진입 → `edit`
- Esc (in edit) → `select`

구조 명령 (Tab/Shift+Tab/Cmd+Z/Cmd+C/X/V) 은 **두 모드 모두**에서 동작 (mode-independent). row navigation 은 select 만, caret 이동은 edit 만.

`mode` state 자체는 outliner-local — zod-crud 는 mode 를 모른다 (다른 editor 가 다른 mode 의미를 가질 수 있음).

## 3. Cursor (focus) + 키보드 navigation

- 단일 활성 좌표 = `useFocus` value (Pointer | null).
- `aria-activedescendant` 의미와 1:1.
- 한 row 의 `<input>` 이 실제 DOM focus 를 가지는데, focus state 는 useFocus 가 별도 보관 →
  RFC 6902 op 적용 후에도 자동 추적 (zod-crud SPEC §0.2 (9)).

### Navigation order — outliner-defined

Visible navigation order = **DFS pre-order over `children` field**, root 제외.
이 정의는 outliner 책임이며 zod-crud 는 모름 — child field 이름 ("children" / "items" / "blocks") 과
visibility (collapse 상태 등) 는 editor 별 결정. zod-crud 는 path arithmetic 만 제공
(`parentPointer` / `lastSegmentIndex` / `withLastSegment` ...).

[`src/pointer-utils.ts`](./src/pointer-utils.ts) 의 `nextVisible` / `prevVisible` /
`firstVisible` / `lastVisible` / `firstChildOf` 가 이 순서의 정본.

| 키 | command | 동작 |
|----|---------|------|
| ArrowUp | focus-prev | DFS 직전 row |
| ArrowDown | focus-next | DFS 직후 row |
| ArrowLeft | focus-parent | parent row (root 까지는 안 감) |
| ArrowRight | focus-first-child | 첫 자식 (없으면 무동작) |
| Home | focus-first | DFS 첫 row |
| End | focus-last | DFS 마지막 row |
| Shift+ArrowUp/Down | extend-up/down | DFS 기반 selection range 확장 |

## 4. Multi-select

- `useSelection` mode = `"extended"`. anchor + focus + 펼친 range 보관.
- 클릭 정책 ([`Outliner.tsx`](./src/Outliner.tsx) `onClickRow`):

| 조작 | 효과 |
|------|------|
| 단일 클릭 | `selection.set([p])` + `focus.set(p)` |
| Shift+클릭 | `selection.range(anchor, p)` + `focus.set(p)` (anchor 없으면 set 처럼) |
| Cmd/Ctrl+클릭 | `selection.toggle(p)` + `focus.set(p)` |

- 키보드 `Shift+ArrowUp/Down` 으로도 range 확장 ([`commands.ts`](./src/commands.ts)
  `extendSelection`).
- `Cmd+A` = 모든 노드 선택 (root 제외).

## 5. Clipboard

[`src/clipboard.ts`](./src/clipboard.ts) 가 정본 — 100% JSON 버퍼.

```ts
{ mode: "empty" | "copy" | "cut", values: OutlineNode[], sources: Pointer[] }
```

- `copy(state, sources)` — sources 의 deep clone 을 buffer 에 보관.
- `cut(state, sources)` — 마찬가지로 보관, paste 시 source 제거 batch 추가.
- `paste(target, mode, ops)` — RFC 6902 batch 생성:

| paste mode | RFC 6902 |
|------------|----------|
| `sibling` | sources 를 `target` 다음 형제로 add (cut 모드면 source remove 추가) |
| `child` | sources 를 `target/children/-` 에 append |

paste 가 atomic batch 라 G8 그대로 보장 — schema 위반 시 전체 롤백.

## 6. Commands

[`src/commands.ts`](./src/commands.ts) 가 정본. 14개 CommandId 와 1:1.

각 command 의 **동작 대상** 결정 규칙:
- `selection.values.length > 0` 이면 selection
- 아니면 `focus.value` 단일

multi-target 작업 (remove, copy, cut) 은 DFS 정렬 후 뒤에서부터 처리해 인덱스 충돌 회피.

## 7. Error UX

- `useJsonDocument({ strict: false, onError })` 콜백으로 모든 실패가 흐름.
- toast 로 2.5s 표시 (`<div role="status" aria-live="polite">`).
- copy/cut 성공도 info toast 로 표시 (선택 개수 알림).
- 위반 코드:

| 코드 | 시점 |
|------|------|
| `path_not_found` | 빈 selection / root 제거 시도 / "no previous sibling" 등 |
| `schema_violation` | text 가 schema 위반 시 (현재 schema 는 string 만 강제) |
| `move_into_self` | promote/demote 가 자기 자손으로 갈 때 |

## 8. 비-목표

- Drag and drop, virtual scroll
- 슬래시 커맨드, 검색
- 협업 (CRDT, presence cursor)
- contentEditable 기반 rich text (현재는 단일 string per row)
- 모바일 터치 제스처

위는 후속 wave 또는 별도 reference editor 의 영역.

## 9. 의존

| 의존 | 이유 |
|------|------|
| `zod-crud` | useJsonDocument facade 와 RFC 6902 substrate |
| `zod` | OutlineSchema 정의 |
| `react >=18` | hook |

zod-crud 외에 다른 라이브러리 0. 키보드 dispatcher · clipboard · commands 모두 자체 작성.

## 10. 디렉토리

```
apps/outliner/
├── SPEC.md                  ─ 본 문서
├── package.json
├── vite.config.ts           ─ port 5184
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx             ─ React entry
    ├── Outliner.tsx         ─ UI + dispatcher
    ├── schema.ts            ─ OutlineSchema, SAMPLE
    ├── pointer-utils.ts     ─ Pointer 헬퍼 (parent/lastIndex/walk/compare)
    ├── keymap.ts            ─ chord → command SSOT
    ├── clipboard.ts         ─ useClipboard hook
    ├── commands.ts          ─ CommandId 함수 14개
    └── styles.css
```
