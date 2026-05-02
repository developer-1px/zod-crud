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

git add -A

if git diff --cached --quiet; then
  exit 0
fi

files="$(git diff --cached --name-only)"

has_src=0
has_test=0
has_docs=0
has_config=0
has_hooks=0

while IFS= read -r file; do
  case "$file" in
    src/*) has_src=1 ;;
    test/*|*.test.*|*.spec.*) has_test=1 ;;
    README.md|docs/*|*.md) has_docs=1 ;;
    .claude/*) has_hooks=1 ;;
    package.json|package-lock.json|tsconfig*.json|*.config.*|.gitignore) has_config=1 ;;
  esac
done <<< "$files"

if [ "$has_src" = "1" ]; then
  message="feat: update json crud core"
elif [ "$has_test" = "1" ]; then
  message="test: update json crud coverage"
elif [ "$has_hooks" = "1" ]; then
  message="chore: update automation hooks"
elif [ "$has_docs" = "1" ]; then
  message="docs: update project documentation"
elif [ "$has_config" = "1" ]; then
  message="chore: update project config"
else
  message="chore: checkpoint project changes"
fi

git commit -m "$message"
