#!/usr/bin/env bash

set -euo pipefail

write_outputs() {
  {
    echo "database=$1"
    echo "ui_verify=$2"
    echo "full_verify=$3"
    echo "docs_only=$4"
  } >> "${GITHUB_OUTPUT}"
}

# main is the final safety net: always run every check after merge.
if [[ "${GITHUB_EVENT_NAME}" == "push" && "${GITHUB_REF}" == "refs/heads/main" ]]; then
  write_outputs true true true false
  exit 0
fi

if [[ -z "${BASE_SHA:-}" || -z "${HEAD_SHA:-}" ]]; then
  echo "Unable to determine the comparison range; running the full CI suite." >&2
  write_outputs true true true false
  exit 0
fi

mapfile -t changed_files < <(
  git diff --name-only --diff-filter=ACMRTD "${BASE_SHA}" "${HEAD_SHA}"
)

# An unexpected empty diff must not silently bypass validation.
if (( ${#changed_files[@]} == 0 )); then
  echo "No changed files were detected; running the full CI suite." >&2
  write_outputs true true true false
  exit 0
fi

database=false
ui_verify=false
full_verify=false
docs_only=true

for file in "${changed_files[@]}"; do
  case "${file,,}" in
    readme.md|docs/*|*.docx)
      continue
      ;;
  esac

  docs_only=false

  case "${file}" in
    supabase/*|app/server-actions/*|app/api/*|app/actions.ts|lib/*|scripts/*|e2e/*|package.json|pnpm-lock.yaml|next.config.*|playwright.config.*|playwright.*.config.*|vitest.config.*|tsconfig.json|pnpm-workspace.yaml|.github/workflows/*|.github/scripts/*|.env.example|vercel.json)
      database=true
      ui_verify=true
      full_verify=true
      ;;
    *.css|app/*|components/*|public/*|.gitignore)
      ui_verify=true
      ;;
    *)
      # New or unfamiliar paths are treated as high risk until classified.
      database=true
      ui_verify=true
      full_verify=true
      ;;
  esac
done

write_outputs "${database}" "${ui_verify}" "${full_verify}" "${docs_only}"

echo "CI classification: database=${database}, ui_verify=${ui_verify}, full_verify=${full_verify}, docs_only=${docs_only}"
printf 'Changed: %s\n' "${changed_files[@]}"
