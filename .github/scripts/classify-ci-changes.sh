#!/usr/bin/env bash

set -euo pipefail

write_outputs() {
  {
    echo "database=$1"
    echo "heavy_verify=$2"
    echo "docs_only=$3"
  } >> "${GITHUB_OUTPUT}"
}

# main is the final safety net: always run every check after merge.
if [[ "${GITHUB_EVENT_NAME}" == "push" && "${GITHUB_REF}" == "refs/heads/main" ]]; then
  write_outputs true true false
  exit 0
fi

if [[ -z "${BASE_SHA:-}" || -z "${HEAD_SHA:-}" ]]; then
  echo "Unable to determine the comparison range; running the full CI suite." >&2
  write_outputs true true false
  exit 0
fi

mapfile -t changed_files < <(
  git diff --name-only --diff-filter=ACMRTD "${BASE_SHA}" "${HEAD_SHA}"
)

# An unexpected empty diff must not silently bypass validation.
if (( ${#changed_files[@]} == 0 )); then
  echo "No changed files were detected; running the full CI suite." >&2
  write_outputs true true false
  exit 0
fi

database=false
heavy_verify=false
docs_only=true

for file in "${changed_files[@]}"; do
  case "${file,,}" in
    readme.md|docs/*|*.docx)
      continue
      ;;
  esac

  docs_only=false
  heavy_verify=true

  case "${file}" in
    supabase/*|app/server-actions/*|app/api/*|lib/server/*|lib/auth.ts|lib/auth/*|lib/db.ts|lib/db/*|lib/session.ts|lib/session/*|lib/login-rate-limit*|package.json|pnpm-lock.yaml|.github/workflows/*|.github/scripts/*|.env.example|vercel.json)
      database=true
      ;;
    app/*|components/*|lib/*|e2e/*|public/*|next.config.*|playwright.config.*|vitest.config.*|tsconfig.json|pnpm-workspace.yaml|.gitignore)
      ;;
    *)
      # New or unfamiliar paths are treated as high risk until classified.
      database=true
      ;;
  esac
done

write_outputs "${database}" "${heavy_verify}" "${docs_only}"

echo "CI classification: database=${database}, heavy_verify=${heavy_verify}, docs_only=${docs_only}"
printf 'Changed: %s\n' "${changed_files[@]}"
