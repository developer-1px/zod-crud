# 문서 구조

이 디렉터리는 패키지 사용법이 아니라 프로젝트 판단 기록을 보관한다.
사용자는 먼저 `packages/zod-crud/README.md`, 사이트 문서, `llms.txt`를 읽는다.
`docs` 아래 문서는 표준화, 검토, 릴리스, 채택 이슈처럼 유지보수자가
판단해야 하는 기록을 책임별로 나눈다.

```txt
docs
|-- standard
|   |-- core-standard.md        # 표준 후보 계약
|   `-- foundation-gate.md      # RFC급 파운데이션 판정 기준
|-- review
|   |-- public-api-foundation-protocol.md
|   |-- public-api-foundation-report.md
|   |-- extension-package-doubt-audit.md
|   `-- sibling-product-extension-map.md
|-- release
|   |-- notes.md
|   `-- evaluation-loop.md
`-- adoption
    `-- api-usage-gaps.md
```

## 책임 기준

| 위치 | 책임 | 독자 |
| --- | --- | --- |
| `standard/` | 구현과 분리된 public API 의미론과 conformance 기준 | 표준화 검토자, 대체 구현 작성자 |
| `review/` | public API가 foundation으로 충분한지 검토한 방법과 결과 | maintainer, 릴리스 판단자 |
| `release/` | 릴리스 판단, 검증 루프, 성능·문서 drift 기록 | 릴리스 담당자 |
| `adoption/` | 외부 소비자와 adapter에서 발견한 gap 분류 | adapter 작성자, 채택 지원 담당자 |

`review/extension-package-doubt-audit.md`는 extension package를 concept
extension과 convenience wrapper로 재분류한 제거 판단 기록이다.
`review/sibling-product-extension-map.md`는 sibling repo 제품 요구를
zod-crud core, feature extension, app 책임으로 다시 분류한 기록이다.

## 작성 원칙

- 본문은 한글로 쓴다.
- 코드 식별자, 명령어, 파일 경로, 표준명은 원문을 유지한다.
- public 사용 문서는 외부자 관점으로 쓴다.
- 내부 구현 경로는 maintainer 기록에서만 다룬다.
- 새 문서는 기존 책임 폴더 중 하나에 들어가야 한다.
- 새 책임 폴더가 필요하면 먼저 이 파일의 책임 표를 갱신한다.
