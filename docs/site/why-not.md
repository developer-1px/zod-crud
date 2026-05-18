# Why Not — 거부한 기능 빈자리 메우기

자주 요청되지만 4기둥(Selection / Edit / Clipboard / Undo) × 10 verbs closure 안에서 표현 가능하기에 추가하지 않은 verb 와 canonical 대안.

## Why no `upsert` verb?

### 거부 이유

`set` / `upsert` 는 4기둥 ↔ 10 verbs closure 의 어느 칸에도 귀속되지 않습니다.

- Edit 기둥의 `replace` 는 "있는 것 교체" 의미
- `upsert` 는 "있으면 교체 / 없으면 추가 / undefined 면 제거" — 세 분기의 합성
- RFC 6902 에도 단일 op 가 없음

11번째 verb 로 승격하려면 정체성 한 줄이 흔들립니다. **`add / remove / replace` 의 분기 합성** 으로 충분히 표현 가능합니다.

### Canonical 대안 — dict-record 한 키 쓰기

`z.record(z.string(), V)` 의 키 하나를 변경할 때는 path 를 직접 가리키고 3분기를 명시합니다.

```ts
const writeKey = (k: string, v: V | undefined) => {
  if (v === undefined && current[k] !== undefined) ops.remove(`/path/${k}`);
  else if (v !== undefined && current[k] === undefined) ops.add(`/path/${k}`, v);
  else if (v !== undefined && current[k] !== v) ops.replace(`/path/${k}`, v);
};
```

3분기가 반복돼 거슬리면 앱 내부 helper 로 추출하세요.

### ❌ 안티패턴 — 전체 dict spread + replace

```ts
ops.replace('/cells', { ...cells, [k]: v });   // 한 키 변경 의도인데 dict 전체가 history entry 가 됨
```

surgical patch 의 의의를 죽입니다. undo 가 "dict 전체 교체" 로 되돌아가 사용자 체감이 깨집니다.

---

## Why no `transaction` verb?

### 거부 이유

`transaction(fn)` 또는 `coalesceWith: 'previous'` 같은 묶음 패치 API 는 4기둥 어디에도 귀속되지 않습니다. **history 차원** 의 정책이지 verb 가 아닙니다.

### Canonical 대안 A — local React state preview (권장)

drag mousemove / IME composition 같이 transient 한 입력은 local React state 로 미리보기 후 drop/commit 시점에 한 번만 `ops` 호출합니다. 표준 React 패턴입니다.

```tsx
const [liveWidth, setLiveWidth] = useState<number | null>(null);

const onMouseMove = (e) => setLiveWidth(start + (e.clientX - startX));
const onMouseUp = () => {
  if (liveWidth !== null) ops.replace('/colWidths/A', liveWidth);
  setLiveWidth(null);
};

// 렌더: liveWidth ?? widths.A
```

transient UI state(드래그 미리보기) 와 committed model state 를 분리. 한 번의 drop 이 단일 undo entry.

### Canonical 대안 B — `doc.history.mergeLast()`

키스트로크 burst, 자동완성 적용 등 **commit 후에야 "합치는 게 맞다" 가 결정되는 경우** 에 사용합니다.

```ts
ops.replace('/blocks/0/text', 'h');
ops.replace('/blocks/0/text', 'hi');
ops.replace('/blocks/0/text', 'hil');
doc.history.mergeLast();  // 직전 두 entry 를 한 entry 로 합침 — 임의 횟수 반복 호출 가능
```

### Canonical 대안 C — sidecar (필요 시)

시간/path 휴리스틱이 도메인별로 다른 자동 coalesce 가 필요하면 sidecar 로 만듭니다.

```ts
const coalesce = useHistoryCoalesce(doc, { withinMs: 200, samePath: true });
// 내부: ops.subscribe + setTimeout + 같은 path 비교 → mergeLast() 자동 호출
```

### ❌ 안티패턴 — drag 중 매 mousemove 마다 `ops.replace`

```tsx
const onMouseMove = (e) => {
  ops.replace('/colWidths/A', newWidth);   // 한 drag 에 100+ history entry
};
```

undo 가 px 단위로 100번 되돌아갑니다.

---

## Why no throwing `apply()` variant?

### 거부 이유

같은 의미가 두 표면에 존재하게 됩니다 (`ops.patch` 결과 무시 vs `ops.apply` throw). 같은 정책을 **`strict` 옵션** 으로 이미 표현합니다.

### Canonical 대안 — `strict: true` 한 번만 박기

```tsx
const doc = useJSONDocument(Schema, initial, { strict: true });

// 이제 ops.patch / ops.add / ops.replace 등 모든 mutating 호출이
// JSONResult 를 반환하지만 violation 시 JSONCrudError 를 throw 합니다.
ops.patch(operations);  // 결과 무시 가능 — fire-and-forget
```

- `strict ?? !isProd` — dev 에서는 default true (실수 즉시 발견)
- prod 에서는 default false (graceful degradation)
- per-call override 가 필요하면 `onError` 콜백으로 분기 가능
