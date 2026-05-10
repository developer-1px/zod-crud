# spreadsheet 팀에 전달 프롬프트

아래 블록 통째로 spreadsheet repo 의 Claude 세션에 붙여넣으세요.

---

zod-crud 유지보수팀에서 `../spredsheet` 의 zod-crud 사용을 dogfooding 감사했습니다. 아래 개선 작업을 진행해주세요.

## 컨텍스트

- zod-crud canonical reference: `https://developer-1px.github.io/zod-crud/llms.txt` (먼저 읽고 시작)
- 정체성: zod-crud 는 **JSON tree 라이브러리** (editor 가 아님). 4대 기둥(Selection/Edit/Clipboard/Undo)을 10 verbs 로 정의하고 RFC 6901/6902 위에 매핑한 wrapper.

## 잘 쓰고 있는 부분 (유지)

- `useJsonDocument(SheetSchema, loadInitial(), { history: 100 })` — `src/sheet/useSheet.ts:23`
- `ops.undo() / redo() / canUndo() / canRedo()` — facade verb 직접 사용
- `useSheet.ts:40-44` 의 `writeCell` — dict-record 한 키 쓰기의 **canonical 패턴** (add/remove/replace 3분기, `as never` 없이 통과)
- `useNotes.ts:27-31` 의 `setNote` — 동일 canonical 패턴

## 고쳐야 할 부분 — 전체 dict spread + replace 안티패턴

다음 파일들이 dict-record 한 키 변경 의도인데 **전체 dict 를 spread 해서 통째로 replace** 하고 있습니다. 의도는 "한 컬럼 너비 변경" 인데 history entry 는 "콜와이즈 dict 통째 교체" 가 됩니다. surgical patch 의 의의를 죽입니다.

| 파일 | 라인 | 현재 | 고칠 방향 |
|------|------|------|----------|
| `src/sheet/useColWidths.ts` | 37, 65 | `ops.replace('/colWidths', { ...widths, [col]: w })` | `ops.replace('/colWidths/${col}', w)` (단, 미존재 키면 `add`) |
| `src/sheet/useFormats.ts` | 28 | `ops.replace('/formats', next)` | 키별 path |
| `src/sheet/useStyles.ts` | 50 | `ops.replace('/styles', next)` | 키별 path |
| `src/sheet/useCondFormat.ts` | 33-35 | `ops.replace('/condFormat', filtered)` | 배열 항목별 op |
| `src/sheet/useHidden.ts` | 32, 36 | `ops.replace('/hidden', { ...hidden, rows: [...hidden.rows, row] })` | 배열 path 직접 `/hidden/rows/-` |
| `src/sheet/useValidation.ts` | 38, 44, 50 | `ops.replace('/validation', next)` | 키별 path |
| `src/sheet/useFreeze.ts` | 24, 25 | 부분 ok (전체가 단일 객체라 spread 가 자연스러움) | 그대로 두기 |

### canonical 패턴 (zod-crud 가 의도한 방식)

```ts
// dict-record 한 키 쓰기 — useSheet.writeCell 와 동일 모양
const writeKey = (k: string, v: V | undefined) => {
  const current = dict[k]
  if (v === undefined && current !== undefined) ops.remove(`/path/${k}`)
  else if (v !== undefined && current === undefined) ops.add(`/path/${k}`, v)
  else if (v !== undefined && current !== v) ops.replace(`/path/${k}`, v)
}
```

3분기가 반복돼 거슬리면 **spreadsheet 내부 helper** 로 추출하세요 (zod-crud core 에 들어갈 일은 아님 — 4기둥/10verb closure 침범). 예시:

```ts
// src/sheet/lib/dictOps.ts
export function upsertKey<T extends object, K extends string, V>(
  ops: JsonOps<T>,
  base: `/${string}`,
  current: Record<string, V>,
  key: K,
  value: V | undefined,
) {
  if (value === undefined) {
    if (current[key] !== undefined) ops.remove(`${base}/${key}` as never)
  } else if (current[key] === undefined) {
    ops.add(`${base}/${key}` as never, value)
  } else if (current[key] !== value) {
    ops.replace(`${base}/${key}` as never, value)
  }
}
```

## 좋게 우회한 부분 — 그대로 유지 OR mergeLast 로 단순화

`src/sheet/useColWidths.ts:23` 의 drag mousemove 우회는 **canonical Pattern A** 입니다 (local state preview → drop 시 한 번만 commit). 표준 React 패턴이며 zod-crud 가 권장하는 정본 방법 중 하나.

주석의 `zod-crud#59` 는 zod-crud #56 의 오타로 보입니다. 정정 부탁드립니다.

대안으로 burst commit 후 합치고 싶다면 `doc.history.mergeLast()` 가 있습니다 (`docs/site/operations.md` 의 "실전 시나리오" 참조). 단 drag 의 경우 Pattern A 가 더 자연스러우니 그대로 유지 권장.

## 그밖에 — zod-crud 책임 밖

localStorage migration 보일러플레이트가 7개 sub-hook 에 반복됩니다 (`useFormats`, `useStyles`, `useCondFormat`, `useHidden`, `useNotes`, `useValidation`, `useColWidths`). 이건 zod-crud 정체성 밖이지만, spreadsheet 내부에서 `src/sheet/lib/legacyMigrate.ts` 같은 헬퍼로 묶을 가치는 있어 보입니다. 우선순위 낮음.

## 작업 순서 제안

1. `src/sheet/lib/dictOps.ts` helper 만들기 (위 예시 그대로)
2. 위 7개 파일을 helper 호출로 교체 — 한 파일씩 PR
3. `useColWidths.ts:23` 의 `#59` → `#56` 주석 정정
4. (선택) localStorage migration helper 추출

## 검증

각 파일 변경 후:

```sh
npm run typecheck && npm test
```

history 동작은 dev 에서 한 셀 편집 후 ctrl+z 가 그 셀 하나만 되돌리는지 (이전: 전체 dict 가 되돌아감) 직접 확인.

## 막힐 때

- canonical reference: `https://developer-1px.github.io/zod-crud/llms.txt`
- API surface: `node_modules/zod-crud/dist/index.d.ts`
- 시나리오 예제: zod-crud repo 의 `docs/site/operations.md` (실전 시나리오 섹션)
- zod-crud 어휘 위반이 의심되면 zod-crud repo 팀에 issue 로 보고 (workaround 가 ugly 하면 우리 잘못)
