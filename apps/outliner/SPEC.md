# apps/outliner — Specification

zod-crud 의 첫 번째 reference editor. `useJSONDocument` facade 와 outliner-local 모듈
(`keymap`, `clipboard`, `commands`, `recorder UI`) 를 합쳐 6축(키보드 · cursor ·
multi-select · clipboard · session recording · error) 을 모두 구현한 Workflowy/Roam 풍
outliner.

이 SPEC 은 **outliner 자체의 규약**이다. zod-crud SPEC.md 가 변하지 않는 30년 락인이라면,
이 SPEC 은 reference editor 라 진화 가능하다 (이 문서가 변하면 zod-crud SPEC 은 흔들리지
않아야 한다 — 의존 방향: outliner → zod-crud).

---

## 0. 헌장

- zod-crud 가 제공하는 `useJSONDocument` facade 위에서만 동작한다.
- 100% JSON 직렬화 (G1) — outliner 의 모든 상태 (selection · focus · clipboard buffer ·
  history) 가 `JSON.stringify` round-trip.
- DOM 이벤트 → chord → command → RFC 6902 batch 의 단방향 흐름.
- 사용자 한 동작(키 한 번 누르기) = 한 RFC 6902 batch = 한 history 항목 = 한 React render.
- 텍스트 입력처럼 연속 `onChange` 로 들어오는 편집은 outliner-local 정책으로 500ms 안의
  같은 path 변경을 `history.mergeLast()` 로 coalesce 하여 한 undo step 으로 다룬다.

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
- `command` — `CommandId` union.
- `label` — 메뉴 / 팔레트 / 도움말 표시용.

DOM 이벤트는 `eventToChord` 로 정규화 → `findCommand(chord)` 로 lookup → `dispatch(id)`.
chord 가 keymap 에 없으면 default 동작 통과 (텍스트 입력 등).

주요 mode-independent 단축키:

| chord | command | 동작 |
|-------|---------|------|
| Tab | demote | 현재 row 를 이전 sibling 의 child 로 내림 |
| Shift+Tab | promote | 현재 row 를 parent 의 다음 sibling 으로 올림 |
| Mod+ArrowUp/Down | move-up/down | 현재 row 를 sibling 사이에서 이동 |
| Mod+Z | undo | 마지막 batch 되돌리기 |
| Mod+Shift+Z / Mod+Y | redo | 되돌린 batch 다시 적용 |
| Mod+Shift+\ | toggle-record | session recording 시작/종료. 종료 시 기록이 있으면 JSON 다운로드 |

### IME composition 가드

한글·일본어·중국어 IME 조합 중인 키는 chord 로 처리하지 않는다. `e.isComposing` 또는
`keyCode === 229` 일 때 dispatcher 가 early return 한다. 이 가드 없이는:

- 한글 입력 후 Enter 가 IME 확정 + insert-sibling 두 번 발화
- 일본어 변환 중 ArrowDown 이 후보 이동 + focus-next 충돌

표준 web app 의 IME 처리 (Slack·Notion·CodeMirror 모두 동일 패턴).

## 2.5 Mode — select / edit (Workflowy 모델)

이 outliner 는 **두 모드**를 분리한다. 표준 role model = Workflowy / Roam / LogSeq 의 정통 outliner 패턴 (Notion·VSCode·Excel 도 동일 2-mode 패턴).

| Mode | DOM | Arrow keys | Enter | Esc | 외형 |
|------|-----|------------|-------|-----|------|
| `select` | input readOnly, focus 유지 | row navigation | edit mode 진입 | (no-op) | 파란 배경 |
| `edit` | input editable, caret 보임 | caret 이동 (DOM 기본) | insert sibling + 새 row 도 edit | select mode 로 escape | 흰 배경 + 파란 outline |

기본 모드 = `select`. 진입 트리거:
- click 텍스트 → `select` + focus/selection 이동
- click 불릿 → `select`
- Enter (in select) → `edit`
- insert-sibling 자동 진입 → `edit`
- Esc (in edit) → `select`

구조 명령 (Tab/Shift+Tab/Mod+ArrowUp/Down), history (Mod+Z/Mod+Shift+Z/Mod+Y),
recording toggle (Mod+Shift+\) 은 **두 모드 모두**에서 동작 (mode-independent).
row navigation 과 clipboard 는 select 만, caret 이동은 edit 만.

`mode` state 자체는 outliner-local — zod-crud 는 mode 를 모른다 (다른 editor 가 다른 mode 의미를 가질 수 있음).

### Text edit history coalescing

[`src/hooks/useTextEditCoalesce.ts`](./src/hooks/useTextEditCoalesce.ts) 가 정본. 같은 text path 의
연속 변경이 500ms 안에 들어오면 `doc.history.mergeLast()` 로 합쳐 단일 undo step 으로 만든다.
이 시간 정책은 reference editor 의 UI 정책이며 zod-crud core 는 시간을 모른다.

## 3. Cursor (`selection.focus`) + 키보드 navigation

- 단일 활성 좌표 = `doc.selection.focus` (Pointer | null).
- `aria-activedescendant` 의미와 1:1.
- 한 row 의 `<input>` 이 실제 DOM focus 를 가지는데, 편집 좌표는 DOM 이 아니라
  W3C Selection 모델의 collapsed selection 으로 보관한다.
- RFC 6902 op 적용 후에도 selection tracking 으로 자동 추적된다.

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
- click handler 정본은 [`src/hooks/useClickPolicy.ts`](./src/hooks/useClickPolicy.ts).

| 조작 | 효과 |
|------|------|
| 단일 클릭 | `selection.collapse(p)` |
| Shift+클릭 | `selection.setBaseAndExtent(anchor, p)` (anchor 없으면 단일 클릭처럼 처리) |
| Cmd/Ctrl+클릭 | `selection.toggleRange(p)` |

- 키보드 `Shift+ArrowUp/Down` 으로도 range 확장 ([`src/commands/selection.ts`](./src/commands/selection.ts)
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

[`src/commands/index.ts`](./src/commands/index.ts) 가 barrel 이고, 실제 구현은
`src/commands/structure.ts`, `selection.ts`, `clipboard.ts`, `focus.ts` 로 나뉜다.
`CommandId` 의 mutation/navigation 명령과 1:1 로 대응한다. UI 전용 명령
(`enter-edit`, `exit-edit`, `toggle-record`) 은 `useDispatch`/`Outliner` local state 에서
처리한다.

각 command 의 **동작 대상** 결정 규칙:
- `selection.ranges.length > 0` 이면 selection range
- 아니면 `selection.focus` 단일

multi-target 작업 (remove, copy, cut) 은 DFS 정렬 후 뒤에서부터 처리해 인덱스 충돌 회피.

## 6.5 Session Recording

[`src/hooks/useRecorderUI.ts`](./src/hooks/useRecorderUI.ts) 는 zod-crud 의 `useRecorder` 를
outliner UI 정책으로 감싼다.

| trigger | 동작 |
|---------|------|
| Record 버튼 | 녹화 시작 |
| Stop 버튼 | 녹화 종료 후 step 이 있으면 `outliner-session-*.json` 다운로드 |
| Replay 버튼 | JSON 파일 선택 후 `replayRecording(recording, ops, { speed: 1 })` 실행 |
| Mod+Shift+\ | 현재 mode 와 무관하게 Record/Stop 토글 |

`toggle-record` 는 선택 상태가 없어도 동작해야 하므로 `useDispatch` 에서 `ctx` 존재 여부를
검사하기 전에 처리한다. 녹화 대상은 `doc.ops` 로 commit 된 편집 step 이며, 단순한 mode 전환
같은 outliner-local UI state 는 recording step 이 아니다.

## 7. Error UX

- `useJSONDocument(OutlineSchema, initial, { strict: false, onError })` 콜백으로 모든 실패가 흐름.
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
| `zod-crud` | useJSONDocument facade 와 RFC 6902 substrate |
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
    ├── commands/            ─ CommandId 구현 모듈
    ├── hooks/
    │   ├── useDispatch.ts   ─ command dispatch + UI-local command 처리
    │   └── useRecorderUI.ts ─ session recording download/replay UI policy
    └── styles.css
```
