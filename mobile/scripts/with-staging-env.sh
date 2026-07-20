#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_root="$(cd "$script_directory/.." && pwd)"

load_environment_file() {
  local environment_file="$1"
  [[ -f "$environment_file" ]] || {
    printf 'Missing environment file: %s\n' "$environment_file" >&2
    exit 1
  }

  set -a
  # shellcheck disable=SC1090
  source "$environment_file"
  set +a
}

load_environment_file "$mobile_root/.env.local"
load_environment_file "$mobile_root/.env.staging.local"

required_variables=(
  EXPO_PUBLIC_APP_ENV
  EXPO_PUBLIC_API_BASE_URL
  GOOGLE_MAPS_IOS_API_KEY
)

for variable in "${required_variables[@]}"; do
  [[ -n "${!variable:-}" ]] || {
    printf 'Missing required staging variable: %s\n' "$variable" >&2
    exit 1
  }
done

[[ "$#" -gt 0 ]] || {
  printf 'Usage: %s COMMAND [ARGUMENT ...]\n' "$0" >&2
  exit 1
}

exec "$@"
