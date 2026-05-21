# zod-crud

> **Zod 로 보호되는 headless JSON tree 라이브러리.** RFC 6901 (JSON Pointer) 과 RFC 6902 (JSON Patch) 위에 4기둥 / 10 command verbs 의 편집 어휘를 매핑한 wrapper. State · actions · change records 모두 100% serializable JSON. Pure core, React 는 `zod-crud/react` entrypoint 에 한정.

## 4기둥 ↔ 10 command verbs

| 기둥 | Verbs | Substrate |
|------|-------|-----------|
| **Selection** | `select`, `find` | W3C Selection API · WAI-ARIA APG · RFC 9535 JSONPath |
| **Edit** | `move`, `duplicate`, `replace` | RFC 6902 (add / remove / replace / move / copy) |
| **Clipboard** | `cut`, `copy`, `paste` | JSON fragment |
| **Undo** | `undo`, `redo` | RFC 6902 inverse + history stack |

자주 요청되는 `upsert`, `transaction verb` 등 거부한 기능과 대안은 [Why Not](/docs/why-not).

## 30초 셋업

```tsx
import * as z from 'zod';
import { useJSONDocument } from 'zod-crud/react';

const Schema = z.object({
  cells: z.record(z.string(), z.string()),
});

function Sheet() {
  const { value, ops, commands, can, history } = useJSONDocument(
    Schema,
    { cells: {} },
    { history: 100 }
  );

  const writeCell = (k: string, v: string) => {
    if (v === '' && value.cells[k] !== undefined) ops.remove(`/cells/${k}`);
    else if (v !== '' && value.cells[k] === undefined) ops.add(`/cells/${k}`, v);
    else if (v !== '' && value.cells[k] !== v) ops.replace(`/cells/${k}`, v);
  };

  return (
    <>
      <input value={value.cells.A1 ?? ''} onChange={(e) => writeCell('A1', e.target.value)} />
      <button disabled={!history.canUndo} onClick={commands.undo}>undo</button>
      <button disabled={!history.canRedo} onClick={commands.redo}>redo</button>
    </>
  );
}
```

`doc` 의 중심 표면:

| 필드 | 뜻 |
|------|-----|
| `value` | 현재 JSON 문서 값 (schema-valid) |
| `lastPatch` | 마지막으로 적용된 문서 patch |
| `ops` | RFC 6902 기반 저수준 편집 작업 (`add`/`remove`/`replace`/`move`/`copy`/`patch`) |
| `commit` | patch와 최종 selection을 한 undo entry로 커밋 |
| `commands` | 10 command verbs 와 selection 기반 helper 의 제품 수준 명령 namespace |
| `can` | 명령 실행 가능 여부 guard namespace |
| `check` | 실패 코드가 있는 dry-run guard |
| `schema` | serializable schema introspection |
| `clipboard` | headless JSON fragment buffer |
| `history` | undo/redo 가능 여부 + `mergeLast()` + `transaction(fn)` |
| `selection` | 선택된 JSON Pointer 위치들 (옵션) |

## RFC 매핑 — 어떤 substrate 위에 서 있는가

| RFC | 영역 | 위치 |
|------|------|------|
| **RFC 6901** — JSON Pointer | path 표현 (단일·정확) | `core/pointer/` |
| **RFC 6902** — JSON Patch | 변경 표현 (6 op) | `core/patch/` |
| **RFC 9535** — JSONPath | path 표현 (query·다중) | `core/jsonpath/` |
| **W3C Selection API** + **WAI-ARIA APG** | selection 좌표 어휘 | `core/selection/` |
| **RFC 8927** / draft-bhutton — JSON Schema | schema 외부 다리 (Zod) | `core/schema/` |

전체 매핑 표는 [STANDARDS.md](https://github.com/developer-1px/zod-crud/blob/main/packages/zod-crud/STANDARDS.md).

## 이 라이브러리가 풀지 *않는* 것

- 버튼, input, tree row 같은 **UI 컴포넌트**
- DOM event 와 **keyboard shortcut 자동 연결**
- 브라우저 **clipboard API 직접 호출**
- 시각적 selection 이나 **ARIA 속성 렌더링**
- `upsert` / `transaction verb` / throwing `apply` 같은 **편의 verb** — [Why Not](/docs/why-not)

이 경계 덕에 같은 편집 규칙이 React UI · headless 테스트 · 서버 연동에서 동일하게 재사용됩니다.

## 다음 단계

- **[Quick Start](/docs/getting-started)** — 첫 편집기 5분
- **[useJSONDocument](/docs/concepts)** — facade 표면 깊이 보기
- **[Editor State](/docs/operations)** — ops/history/selection 표면 + 실전 시나리오
- **[Why Not](/docs/why-not)** — 거부한 기능 빈자리 메우기
- **[Core & Design](/docs/advanced)** — SPEC 기반 내부 계약

## LLM 사용자

이 사이트의 정체성/패턴/anti-pattern 을 압축한 정본은 [`/llms.txt`](/llms.txt) 입니다. LLM 으로 zod-crud 를 쓸 때 한 파일로 가져갈 entry point.
