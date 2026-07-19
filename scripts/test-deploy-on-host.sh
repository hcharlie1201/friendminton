#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_directory="$(mktemp -d)"
trap 'rm -rf "$test_directory"' EXIT

deployment_directory="$test_directory/deployment"
fake_bin_directory="$test_directory/bin"
docker_calls="$test_directory/docker-calls"
mkdir -p "$deployment_directory" "$fake_bin_directory"
touch \
  "$deployment_directory/.env.staging" \
  "$deployment_directory/docker-compose.prod.yml"

cat > "$fake_bin_directory/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_CALLS"

if [[ "${FAIL_PULL:-false}" == "true" && "$*" == *" pull" ]]; then
  exit 1
fi
FAKE_DOCKER
chmod +x "$fake_bin_directory/docker"

run_deployment() {
  PATH="$fake_bin_directory:$PATH" \
    DOCKER_CALLS="$docker_calls" \
    bash "$script_directory/deploy-on-host.sh" \
      "$deployment_directory" \
      "test-sha" \
      "staging" \
      "registry.example/friendminton:test-sha" \
      "registry.example"
}

run_deployment
grep -Fxq 'API_IMAGE=registry.example/friendminton:test-sha' \
  "$deployment_directory/.env.image"
grep -Fq 'compose --env-file .env.staging -f docker-compose.prod.yml pull' "$docker_calls"
grep -Fq 'compose --env-file .env.staging -f docker-compose.prod.yml up -d --remove-orphans' "$docker_calls"
grep -Fq 'logout registry.example' "$docker_calls"

printf 'API_IMAGE=registry.example/friendminton:last-good\n' \
  > "$deployment_directory/.env.image"

if FAIL_PULL=true run_deployment >/dev/null 2>&1; then
  printf 'Expected deployment to fail when the image pull fails\n' >&2
  exit 1
fi

grep -Fxq 'API_IMAGE=registry.example/friendminton:last-good' \
  "$deployment_directory/.env.image"

printf 'deploy-on-host behavior tests passed\n'
