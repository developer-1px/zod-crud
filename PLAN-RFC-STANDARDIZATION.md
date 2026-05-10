# RFC 표준화 작업 계획

zod-crud 가 "RFC 6901/6902 라이브러리" 를 자칭하기 위한 4 단계. 각 단계는 의존성 순서. 앞 단계가 통과돼야 다음으로 넘어간다.

근거 우선순위: RFC 표준 (1·2) > De facto (3) > 외부 표준 다리 (4).

---

## Phase 1 — RFC 6902 conformance test suite 통과 (절대 1순위)

**Why**: "RFC 6902 따른다" 의 사실상 게이트. 모든 주류 JSON Patch 라이브러리가 이 suite 를 채택 조건으로 삼음.

**작업**
1. `github.com/json-patch/json-patch-tests` 저장소의 `tests.json` (100+ 케이스) 을 `packages/zod-crud/tests/conformance/` 에 vendor 또는 fetch.
2. 각 케이스 = `{ doc, patch, expected | error, comment, disabled? }` 형식. expected 가 있으면 결과 비교, error 면 실패 검증.
3. 별도 vitest 파일 `tests/rfc6902-conformance.test.ts` — 모든 케이스를 표 기반으로 돌림.
4. 실패 케이스 분석 → `core/patch.ts` 수정 또는 SPEC 에 명시적 deviation 기록.
5. SPEC.md §3 에 "RFC 6902 conformance" 절 추가, 통과율 명시.

**완료 조건**
- [ ] tests.json 의 100% 또는 명시 deviation 처리한 케이스 통과
- [ ] CI 가 conformance 테스트 차단 (실패 시 main 보호)
- [ ] SPEC 에 통과 인증 절 추가

**부수 효과**: edge case (escape, deep nested, error code) 가 코드에 강제됨.

---

## Phase 2 — RFC 6901 §6 URI fragment 표현 지원

**Why**: 다른 표준 (JSON Schema `$ref`, JSON Reference) 가 Pointer 를 fragment 형식 (`#/foo/bar`) 으로 사용. 미지원 시 다른 RFC 와 호환 끊김.

**작업**
1. `parsePointer(pointer: string)` 가 `#` prefix 받으면 percent-decoding 후 파싱.
2. `buildPointer(segments, { uriFragment?: boolean })` 옵션 추가 — true 면 `#` prefix + percent-encoding.
3. 기존 외부 API 는 string 형식 그대로 (기본 = JSON String 표현).
4. SPEC §2 에 두 형식의 의미 명시 + cross-reference.

**완료 조건**
- [ ] parse / build 가 양 형식 round-trip
- [ ] RFC 6901 §6 예제 4 개 (fragment 형) 테스트 통과
- [ ] SPEC 에 두 표현 명시

**의존**: Phase 1 완료 후 (parsing path 변경이 conformance 에 영향).

---

## Phase 3 — RFC 5789 + 6902 over HTTP 어댑터

**Why**: REST API 통합의 사실상 진입 조건. `application/json-patch+json` content-type 의 표준 통신 path 를 sigh 기 만에.

**작업**
1. 새 모듈 `packages/zod-crud/src/http.ts` (선택적 import).
2. `parsePatchResponse(body, contentType)` — `application/json-patch+json` 또는 `application/merge-patch+json` 에 따라 `JsonPatchOperation[]` 반환.
3. `buildPatchRequest(ops)` — `{ headers: { 'content-type': 'application/json-patch+json' }, body: JSON.stringify(ops) }`.
4. ETag 조건부 PATCH 헬퍼: `withIfMatch(req, etag)`.
5. SPEC §5 에 통신 어휘 절 추가.

**완료 조건**
- [ ] 양 미디어 타입 인식·생성
- [ ] ETag 헬퍼
- [ ] 예제 (apps/site 또는 docs) 에 서버-클라 라운드트립 시연

**의존**: Phase 1, 2 완료.

---

## Phase 4 — JSON Schema 양방향 (RFC 8927 / draft-bhutton)

**Why**: zod 결합을 외부 표준 도구 (Ajv, OpenAPI, AsyncAPI) 로 풀어내는 다리. 미연결 시 우리 schema 가 우리 안에 갇힘.

**작업**
1. zod 4 가 제공하는 `z.toJSONSchema()` (있으면 사용) — 없으면 핵심 타입(`object`/`array`/`string`/`number`/`record`/`union`) 매핑 작성.
2. `JSONSchemaToZod(schema)` — JSON Schema draft-2020-12 의 핵심 키워드 (`type`/`properties`/`required`/`items`/`enum`/`oneOf`) 를 zod 로.
3. `ops.load` 가 JSON Schema 를 받으면 자동 변환 옵션.
4. SPEC §1 에 schema 양방향 절 추가.

**완료 조건**
- [ ] OutlineSchema → JSON Schema export → 외부 Ajv 로 검증 round-trip
- [ ] 핵심 키워드 매핑 단위 테스트
- [ ] 미지원 키워드는 명시적 throw (silent loss 금지)

**의존**: Phase 1 완료 (substrate 안정 후).

---

## 비-목표 / 결단 필요 항목

- **RFC 7396 JSON Merge Patch** — 지원 vs 명시적 비-목표. 별도 결단.
- **RFC 9535 JSONPath** — selection 의 표준 query 어휘. selection·focus 와의 충돌 가능성, 별도 논의.
- **CRDT/OT** — 헌장상 비-목표. 표준화 큰 그림에서 재확인 필요.

---

## 진행 추적

GitHub issue 4 개 (Phase 1~4) 가 정본. 본 문서는 의존 관계와 근거를 모은 인덱스.
