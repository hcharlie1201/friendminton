#!/usr/bin/env bash

set -euo pipefail

readonly deploy_path="$1"
readonly deploy_sha="$2"
readonly deploy_environment="$3"
readonly deploy_image="$4"
readonly ecr_registry="$5"
readonly environment_file=".env.${deploy_environment}"
readonly image_file=".env.image"
readonly compose_file="docker-compose.prod.yml"

fail() {
  printf 'Deployment error: %s\n' "$1" >&2
  exit 1
}

compose() {
  API_IMAGE="$deploy_image" docker compose \
    --env-file "$environment_file" \
    -f "$compose_file" \
    "$@"
}

logout_from_ecr() {
  docker logout "$ecr_registry" >/dev/null 2>&1 || true
}

trap logout_from_ecr EXIT

printf 'Deploying %s to %s from %s\n' \
  "$deploy_sha" "$deploy_environment" "$deploy_image"

cd "$deploy_path" || fail "cannot enter DEPLOY_PATH: $deploy_path"
[[ -f "$environment_file" ]] || fail "missing $deploy_path/$environment_file"
[[ -f "$compose_file" ]] || fail "missing $deploy_path/$compose_file"
command -v docker >/dev/null || fail "docker is not installed on the server"
docker compose version >/dev/null || fail "the Docker Compose plugin is unavailable"
compose config --quiet || fail "$environment_file is incomplete or the Compose configuration is invalid"

compose pull || fail "docker compose pull failed"
compose up -d --remove-orphans || fail "docker compose deployment failed"

temporary_image_file="$(mktemp .env.image.XXXXXX)"
printf 'API_IMAGE=%s\n' "$deploy_image" > "$temporary_image_file"
mv "$temporary_image_file" "$image_file"

compose ps
