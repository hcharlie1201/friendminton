#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mobile_root="$(cd "$script_directory/.." && pwd)"
artifact_directory="$mobile_root/builds"

mkdir -p "$artifact_directory"
export EAS_LOCAL_BUILD_ARTIFACTS_DIR="$artifact_directory"

exec "$script_directory/with-staging-env.sh" \
  pnpm dlx eas-cli@latest build \
    --platform ios \
    --profile testflight \
    --local
