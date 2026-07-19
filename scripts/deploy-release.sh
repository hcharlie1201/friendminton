#!/usr/bin/env bash

set -euo pipefail

required_variables=(
  AWS_REGION
  DEPLOY_ECR_REGISTRY
  DEPLOY_ENVIRONMENT
  DEPLOY_HOST
  DEPLOY_IMAGE
  DEPLOY_PATH
  DEPLOY_SHA
  DEPLOY_USER
)

for variable in "${required_variables[@]}"; do
  [[ -n "${!variable:-}" ]] || {
    printf 'Missing required environment variable: %s\n' "$variable" >&2
    exit 1
  }
done

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_directory/.." && pwd)"
ssh_key="$HOME/.ssh/friendminton_deploy"
ssh_target="$DEPLOY_USER@$DEPLOY_HOST"
ssh_options=(
  -i "$ssh_key"
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
)

run_remote() {
  ssh "${ssh_options[@]}" "$ssh_target" "$@"
}

logout_from_ecr() {
  run_remote docker logout "$DEPLOY_ECR_REGISTRY" >/dev/null 2>&1 || true
}

printf 'Preparing deployment directory %s...\n' "$DEPLOY_PATH"
run_remote bash -s -- "$DEPLOY_PATH" <<'REMOTE_SCRIPT'
set -euo pipefail
mkdir -p "$1"
REMOTE_SCRIPT

printf 'Uploading deployment manifests...\n'
scp \
  "${ssh_options[@]}" \
  "$repository_root/Caddyfile" \
  "$repository_root/docker-compose.prod.yml" \
  "$ssh_target:$DEPLOY_PATH/"

printf 'Authenticating the server to ECR...\n'
aws ecr get-login-password --region "$AWS_REGION" \
  | run_remote docker login \
    --username AWS \
    --password-stdin "$DEPLOY_ECR_REGISTRY"
trap logout_from_ecr EXIT

printf 'Deploying image %s...\n' "$DEPLOY_IMAGE"
run_remote \
  bash -s -- \
  "$DEPLOY_PATH" \
  "$DEPLOY_SHA" \
  "$DEPLOY_ENVIRONMENT" \
  "$DEPLOY_IMAGE" \
  "$DEPLOY_ECR_REGISTRY" \
  < "$script_directory/deploy-on-host.sh"
