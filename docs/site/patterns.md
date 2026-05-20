# Patterns — 시나리오별 정본 카탈로그

"X 를 만들고 싶다" → 거기에 맞는 canonical 코드. 베껴 쓸 수 있게 짧고 자족적으로.

---

## 1. Dict-record 한 키 쓰기

**언제**: `z.record(z.string(), V)` 스키마의 키 한 개 변경. spreadsheet 의 cells, notes, formats 같은 dict-shaped state.

**Canonical**:

```ts
const writeKey = (k: string, v: V | undefined) => {
  if (v === undefined && current[k] !== undefined) ops.remove(`/path/${k}`);
  else if (v !== undefined && current[k] === undefined) ops.add(`/path/${k}`, v);
  else if (v !== undefined && current[k] !== v) ops.replace(`/path/${k}`, v);
};
```

3분기가 반복되면 앱 내부 `dictOps` helper 로 추출. 자세한 이유와 안티패턴은 [Why no upsert verb](/docs/why-not#why-no-upsert-verb-issue-53) 참조.

---

## 2. Drag / keystroke burst — undo entry 폭증 방지

**언제**: 컬럼 드래그 리사이즈, IME composition, 빠른 키스트로크 등 transient 한 입력이 ops 를 100+ 번 호출하는 상황.

**Pattern A — local React state preview** (권장):

```tsx
const [livePreview, setLivePreview] = useState<V | null>(null);

const onMove = (e) => setLivePreview(computeFrom(e));
const onDrop = () => {
  if (livePreview !== null) doc.ops.replace('/path', livePreview);
  setLivePreview(null);
};

// 렌더: livePreview ?? committedValue
```

**Pattern B — `doc.history.mergeLast()`** (commit 후 합치기):

```ts
ops.replace('/text', 'h');
ops.replace('/text', 'hi');
ops.replace('/text', 'hil');
doc.history.mergeLast();  // 직전 두 entry 를 한 entry 로 합침
```

**Pattern C — `doc.history.transaction(fn)`** (동기 작업을 한 history step 으로):

```ts
doc.history.transaction(() => {
  ops.replace('/title', 'Saved');
  ops.add('/logs/-', 'saved title');
});
```

**Pattern D — `doc.commit(patch, { selection })`** (patch와 caret/range를 한 step으로):

```ts
doc.commit(
  [{ op: 'replace', path: '/blocks', value: nextBlocks }],
  {
    label: 'insertText',
    origin: 'editor',
    selection: { type: 'collapse', point: { path: '/blocks/0', offset: 2 } },
  },
);
```

자세한 비교는 [Why no transaction verb](/docs/why-not#why-no-transaction-verb-issue-56).

---

## 3. Selection 이 patch 를 자동으로 따라가기

**언제**: 항목을 삭제·이동했을 때 selection 좌표가 깨지지 않아야 함.

**Canonical**: zero-config — selection 은 ops.subscribe 로 commit 을 듣고 Pointer 를 자동 follow.

```ts
const doc = useJSONDocument(Schema, initial, { selection: { mode: 'multiple' } });

doc.selection?.collapse('/items/2');
doc.ops.remove('/items/0');
// doc.selection.focus 는 /items/1 로 이동 — 직접 보정 불필요
```

해드리스 환경에서는 `trackPointer` 를 직접 호출. `core/track.ts` 참조.

---

## 4. Clipboard roundtrip — cut / copy / paste

**언제**: 사용자가 노드를 잘라/복사해서 다른 위치에 붙이기. JSON fragment 단위.

**Canonical**:

```ts
const copied = doc.commands.copy('/items/0');  // read-only JSON fragment
if (copied.ok) {
  doc.commands.paste(copied.payload, '/items/-');
}

const cut = doc.commands.cut('/items/1');      // payload 산출 + remove patch commit
if (cut.ok) {
  doc.commands.paste(cut.payload, '/archive/-');
}
```

DOM Clipboard API 와의 연결은 사용자 책임 — `navigator.clipboard` 호출은 라이브러리 본체 밖입니다.

`can` 으로 가능 여부 가드:

```tsx
<button
  disabled={!copied.ok || !doc.can.paste(copied.payload, '/items/-')}
  onClick={() => copied.ok && doc.commands.paste(copied.payload, '/items/-')}
>
  paste
</button>
```

---

## 5. Optimistic HTTP sync — 서버와 합의 (RFC 5789 + 6902 / 7396)

**언제**: 로컬에서 즉시 commit 하고 서버에 patch 를 전송, 실패 시 inverse 로 되돌리기.

**Canonical**:

```ts
import {
  applyPatch,
  buildPatchRequest,
  computeInverses,
  parsePatchResponse,
  withIfMatch,
} from 'zod-crud';

const inverse = computeInverses(prev, ops);
const applied = applyPatch(Schema, prev, ops);
if (!applied.result.ok || !inverse.ok) return;  // schema 위반이면 commit 안 됨

const req = withIfMatch(buildPatchRequest(ops), etag);
const res = await fetch(`/api/doc/${id}`, req);
const parsed = parsePatchResponse(await res.text(), res.headers.get('content-type'));
if (!res.ok || !parsed.ok) rollback(inverse.inverses);  // 서버 거부 → 로컬 되돌리기
```

`JSON_PATCH_MIME` / `MERGE_PATCH_MIME` 상수도 export. wire format 만 다루고 transport 결정은 앱이.

---

## 6. Headless `applyPatch` — React 없이

**언제**: 테스트, CLI, 서버사이드 — React 없이 같은 편집 규칙 재사용.

**Canonical**:

```ts
import { applyPatch } from 'zod-crud';

const { state, result } = applyPatch(Schema, prev, [
  { op: 'replace', path: '/title', value: 'final' },
]);

if (result.ok) commit(state);
else log(result.reason ?? result.code);
```

같은 schema · 같은 op 가 React UI / 테스트 / 서버에서 동일한 결과.

---

## 7. Sidecar — session recorder

**언제**: 사용자 세션을 patch stream 으로 녹화 → 재생 (bug repro, 데모, 데이터 마이그레이션 검증).

**Canonical**:

```tsx
import { useRecorder, replayRecording } from 'zod-crud/react';

function App() {
  const doc = useJSONDocument(Schema, initial);
  const recorder = useRecorder(doc.ops);

  return (
    <>
      <button onClick={recorder.start}>record</button>
      <button onClick={() => download('session.json', JSON.stringify(recorder.stop()))}>save</button>
      <button onClick={() => replayRecording(uploadedJson, doc.ops, { speed: 1 })}>replay</button>
    </>
  );
}
```

sidecar 는 core 의 정상 흐름(ops.subscribe · history)을 *관찰만* 합니다. 본체 데이터 동작 영향 없음.
