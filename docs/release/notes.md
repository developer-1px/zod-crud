# 릴리스 기록

이 문서는 공개 계약과 릴리스 게이트에 영향을 준 결정만 기록한다.
사용법은 README와 사이트 문서에 둔다.

## 0.12.0 패키지 import 계약

날짜: 2026-05-22

### 변경 내용

- 공개 package import는 `zod-crud`와 `zod-crud/react`로 제한한다.
- root `zod-crud` entrypoint는 React에 의존하지 않는다.
- `zod-crud/react`는 `useJSONDocument`를 export한다.
- 전체 공개 export 목록은 `packages/zod-crud/public-contract.json`에 기록한다.

### 공개 계약

패키지 import 경로는 변경되지 않았다.

```ts
import { createJSONDocument } from "zod-crud";
import { useJSONDocument } from "zod-crud/react";
```

`zod-crud/react` 외의 package subpath는 import하지 않는다.

### 릴리스 게이트

릴리스 전에는 다음을 실행한다.

```sh
npm run verify
```

이 게이트는 `docs:evaluate`, package smoke test, site docs check,
릴리스 기록과 source-layout drift check를 포함한다.

## 0.12.0 프로덕션 API 잠금

날짜: 2026-05-24

### 변경 내용

- root type export에 공개 `JSONDocument` facade에서 보이는 support type을
  포함했다. 예: document options, read/schema/clipboard result,
  selection options/result, copy/cut/duplicate/paste result type.
- runtime entrypoint는 그대로 `zod-crud`, `zod-crud/react`다.
- `doc.ops`, `doc.commands`, `doc.check`, `doc.can` namespace는 프로덕션
  root 계약 밖에 둔다. 그 이름이 필요한 consumer는 local adapter를
  만들어 사용한다.

### 릴리스 게이트

`npm run verify`와 package tarball smoke가 통과해야 publish할 수 있다.

## 1.0 준비 릴리스 게이트

날짜: 2026-05-24

### 변경 내용

- root `release:check` script를 최종 local gate로 추가했다.
- 이 게이트는 `verify`, `standard:check`, `perf:core`, `pack:library`를
  순서대로 실행한다. package check, docs drift check, 표준 conformance,
  browser demo smoke, performance measurement, tarball creation을 따로 기억할
  필요가 없게 한다.
- 공개 export 이름은 `packages/zod-crud/public-contract.json`에 잠근다.
  package smoke test, docs consistency test, docs evaluation은 같은 파일을
  contract SSOT로 읽는다.
- package `prepublishOnly`는 root `release:check`로 위임한다. 따라서 수동
  publish도 docs, browser, performance, pack gate를 우회할 수 없다.

### 릴리스 게이트

1.0 publish 전에는 다음을 실행한다.

```sh
npm run release:check
```

## RFC급 foundation 표준화 트랙

날짜: 2026-05-28

### 변경 내용

- `docs/standard/core-standard.md`를 공개 계약의 규범 core standard 초안으로
  추가했다.
- `packages/zod-crud/tests/public/standard-conformance.test.ts`를 공개
  entrypoint 기반 conformance suite seed로 추가했다.
- `scripts/evaluate-standardization.mjs`와 root `standard:check`를 추가했다.
- `release:check`에 `standard:check`를 포함해 foundation semantics를 릴리스
  기계 검증과 함께 gate한다.

### Foundation 판단

패키지는 RFC급 foundation 후보가 될 수 있다. 다만 최종 선언은 규범 의미론,
conformance, adapter pressure, concept minimality, 반복 clean review를 통과한
뒤에만 가능하다.

## 1.0.0 패키지 버전

날짜: 2026-05-24

### 변경 내용

- package version은 `1.0.0`이다.
- `1.0.0` 패키지 버전은 `packages/zod-crud/package.json`과 release gate에서
  함께 검증한다.
- 1.0 package identity는 `prepublishOnly`와 같은 root `release:check` 경로로
  검증한다.

### 릴리스 게이트

1.0.0 publish 전에는 다음을 실행한다.

```sh
npm run release:check
```

## 1.0 외부 gap 분류

날짜: 2026-05-24

### 변경 내용

- `docs/adoption/api-usage-gaps.md`는 legacy `doc.ops`나 `doc.commands`
  기대를 zod-crud 1.0 root 계약 blocker로 분류하지 않는다.
- 그 이름들은 여전히 외부 adapter와 migration 이슈다.
- `docs:evaluate`와 docs consistency test는 API gap 기록에 미해결 release
  blocker 표현이 남지 않도록 검사한다.
- 남은 외부 사용 우선순위는 1.0 이후 도입 작업이며 package release blocker가
  아니다.

### 릴리스 결정

- `doc.ops`와 `doc.commands`는 프로덕션 root 계약 밖에 둔다.
- 잠긴 root와 `zod-crud/react` 공개 계약으로 1.0 package를 낸다.
