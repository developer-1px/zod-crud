#!/usr/bin/env bash
# Stop 훅: LLM 에게 도메인 딕셔너리 유지 작업을 자동 수행하도록 지시 메시지를 남긴다.
# 단일 SSOT: packages/zod-crud/GLOSSARY.md
#
# 메시지는 stdout 으로 출력되며, Claude 가 후속 턴에서 user 피드백으로 받는다.

cat <<'MSG'
[domain-dictionary-reminder]
이번 턴에서 도입·갱신된 도메인 용어가 있으면 packages/zod-crud/GLOSSARY.md 를 자동으로 업데이트하라.

원칙:
- 단일 SSOT: packages/zod-crud/GLOSSARY.md (없으면 생성)
- 한 항목 = 용어 + 1~2 문장 정의 + (있으면) SPEC.md 조항 또는 RFC 참조
- 알파벳·기호·한글 순으로 자동 정렬
- 표준 어휘 (RFC 6901·6902·WAI-ARIA APG 등) 와 프로젝트 어휘 (Axis 1·2, Pointer, JsonOps, useJson 등) 모두 등재
- 이번 턴에서 한 번도 새 용어가 등장하지 않았으면 변경하지 않는다
- 변경이 있으면 의미 있는 conventional commit 메시지로 별도 커밋 (auto-commit 훅이 처리)

게으르게 통과시키지 말고, 새로 정의한 모든 용어를 빠짐없이 반영해라.
MSG
