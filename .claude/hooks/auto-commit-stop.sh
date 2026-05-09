#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$repo_root" ]; then
  exit 0
fi

cd "$repo_root"

if [ "${ZOD_CRUD_AUTO_COMMIT:-1}" = "0" ]; then
  exit 0
fi

git_dir="$(git rev-parse --git-dir)"

if [ -f "$git_dir/MERGE_HEAD" ] || [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
  exit 0
fi

if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

status="$(git status --short)"

reason="커밋되지 않은 변경이 있습니다. 내용을 검토한 뒤 적절한 conventional-commit 메시지로 직접 git commit 하세요. 변경 요약을 본 뒤 본인이 메시지를 작성해야 합니다 — 자동 분류 금지.

git status --short:
${status}"

jq -n --arg r "$reason" '{decision:"block", reason:$r}'
