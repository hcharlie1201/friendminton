#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_root="$(cd "$script_directory/.." && pwd)"
artifact_directory="$mobile_root/builds"
latest_ipa=""

if [[ -d "$artifact_directory" ]]; then
  while IFS= read -r candidate; do
    if [[ -z "$latest_ipa" || "$candidate" -nt "$latest_ipa" ]]; then
      latest_ipa="$candidate"
    fi
  done < <(find "$artifact_directory" -maxdepth 1 -type f -name '*.ipa' -print)
fi

[[ -n "$latest_ipa" ]] || {
  printf 'No IPA found in %s. Run pnpm run testflight:build first.\n' \
    "$artifact_directory" >&2
  exit 1
}

printf 'Submitting %s to TestFlight...\n' "$(basename "$latest_ipa")"
exec pnpm dlx eas-cli@latest submit \
  --platform ios \
  --profile testflight \
  --path "$latest_ipa"
