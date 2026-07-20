#!/usr/bin/env bash
set -euo pipefail

app_environment="${APP_ENV:-development}"
if [[ "$app_environment" != "development" ]]; then
  echo "Refusing to load local demo data when APP_ENV=$app_environment." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd "$script_dir/.." && pwd)"
seed_assets_dir="$repository_dir/seeds/assets"
seed_sql="$repository_dir/seeds/development.sql"
upload_dir="${UPLOAD_DIR:-uploads}"
database_url="${DATABASE_URL:-postgres://friendminton:friendminton@localhost:5432/friendminton}"

if [[ "$upload_dir" != /* ]]; then
  upload_dir="$repository_dir/$upload_dir"
fi

if [[ -z "$upload_dir" || "$upload_dir" == "/" ]]; then
  echo "Refusing to use an unsafe UPLOAD_DIR." >&2
  exit 1
fi

if [[ "$database_url" != *"@localhost:"* && "$database_url" != *"@127.0.0.1:"* ]]; then
  echo "Refusing to seed a non-local DATABASE_URL." >&2
  exit 1
fi

copy_post_photo() {
  local user_id="$1"
  local source_name="$2"
  local destination_name="$3"
  local destination_dir="$upload_dir/posts/$user_id"

  install -d "$destination_dir"
  install -m 0644 "$seed_assets_dir/$source_name" "$destination_dir/$destination_name"
}

copy_post_photo 'a1000000-0000-4000-8000-000000000001' 'seagull.jpg' 'seagull.jpg'
copy_post_photo 'a1000000-0000-4000-8000-000000000002' 'color-squiggles.jpg' 'color-squiggles.jpg'
copy_post_photo 'a1000000-0000-4000-8000-000000000002' 'seagull.jpg' 'seagull.jpg'
copy_post_photo 'a1000000-0000-4000-8000-000000000003' 'seagull.jpg' 'seagull.jpg'
copy_post_photo 'a1000000-0000-4000-8000-000000000003' 'color-squiggles.jpg' 'color-squiggles.jpg'
copy_post_photo 'a1000000-0000-4000-8000-000000000003' 'seagull.jpg' 'seagull-alt.jpg'

if command -v psql >/dev/null 2>&1; then
  psql "$database_url" -v ON_ERROR_STOP=1 -f "$seed_sql"
elif command -v docker >/dev/null 2>&1; then
  docker compose --project-directory "$repository_dir" exec -T postgres \
    psql -U friendminton -d friendminton -v ON_ERROR_STOP=1 < "$seed_sql"
else
  echo "Install psql or Docker before loading the development seed data." >&2
  exit 1
fi

echo "Loaded three development users, workouts, and photo posts."
