# Friendminton

Friendminton is a Rust/Axum MVP for a badminton community app inspired by Strava:
find nearby players, create game invites, track workouts, and share workout posts.

## Stack

- Axum for HTTP routing.
- SQLx for Postgres access, migrations, and dynamic SQL via `QueryBuilder`.
- Postgres with UUID primary keys and simple discovery indexes.
- OpenAPI via `aide` for generated mobile clients.
- `better-auth` is kept in the dependency graph so the temporary `x-user-id` MVP auth can be replaced with a real session layer next.

## Run Locally

```sh
cp .env.example .env
docker compose up -d postgres
DATABASE_URL=postgres://friendminton:friendminton@localhost:5432/friendminton cargo run
```

The app runs migrations automatically on startup.

## Runtime Configuration

Set `APP_ENV` to `development`, `staging`, or `production`. Non-secret defaults and third-party
provider choices live in `config/<environment>.toml`; deploy-specific values and secrets stay in
the matching uncommitted `.env` file. Environment variables take precedence over the profile.

Staging and production fail at startup unless `DATABASE_URL`, an HTTPS `PUBLIC_BASE_URL`, and S3
object storage are configured. The OpenAPI document uses `PUBLIC_BASE_URL`, so generated clients
point at the correct environment instead of always advertising localhost.

See [docs/deployment.md](docs/deployment.md) for the staging/production model, GitHub Environment
setup, CI/CD behavior, and the steps to designate the existing Lightsail instance as staging.

## Deploy On A VPS

This repo includes a production Docker setup for a small VPS such as AWS Lightsail.

On the server:

```sh
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker ubuntu
```

Log out and back in, then:

```sh
git clone https://github.com/YOUR_USER/friendminton.git
cd friendminton/friendminton
cp .env.staging.example .env.staging
```

Edit `.env.staging` and set a long random `POSTGRES_PASSWORD`. The `DATABASE_URL`
password must match it. Set `S3_BUCKET` to the private Lightsail object storage bucket
attached to this instance.

The API runs in Docker and reads temporary bucket credentials from the Lightsail
Instance Metadata Service. Allow IMDSv2 responses to cross the container network hop:

```sh
aws lightsail update-instance-metadata-options \
  --instance-name YOUR_INSTANCE_NAME \
  --http-endpoint enabled \
  --http-tokens required \
  --http-put-response-hop-limit 2 \
  --region us-west-2
```

For a quick HTTPS test without buying a domain, keep:

```env
DOMAIN=16.146.136.68.sslip.io
```

Then deploy:

```sh
docker compose --env-file .env.staging -f docker-compose.prod.yml up -d --build
```

Check logs:

```sh
docker compose --env-file .env.staging -f docker-compose.prod.yml logs -f api
```

The API should be available at:

```text
https://16.146.136.68.sslip.io/healthz
https://16.146.136.68.sslip.io/swagger-ui
```

## OpenAPI

The generated API contract is available at:

```sh
curl http://localhost:3000/openapi.json
```

Swagger UI is available in the browser at:

```text
http://localhost:3000/swagger-ui
```

Generate the Hey API TypeScript client with `pnpm run generate:api` from `mobile/`.
The app-owned runtime config adds the API base URL and auth headers.

## Mobile App

The Expo app lives in `mobile/`.

```sh
cd mobile
cp .env.example .env
pnpm start
```

Set the API URL for your target device:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

For iOS Simulator, `localhost` can reach your Mac. For a physical phone, use your
computer's LAN IP or the deployed HTTPS URL instead. The app uses Expo Router
protected routes: signed-out users see the login screen, and signed-in users are
stored locally with `expo-secure-store` and routed into the main app.

Photo uploads use the same typed flow in both environments. Local development stores
files under `uploads/`; production asks the Rust API for a five-minute presigned S3
`PUT` URL. Postgres stores stable object keys, and feed responses contain one-hour
presigned read URLs. AWS credentials are never sent to the mobile app.

Regenerate the mobile API types after backend route/schema changes:

```sh
cd mobile
pnpm run generate:api
```

That command reads `${EXPO_PUBLIC_API_BASE_URL}/openapi.json` and updates the
Hey API generated client in `src/api/generated`. Generated files include request
functions and types, and the app calls those generated SDK functions directly.

## MVP API

Create a user:

```sh
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"lee@example.com","display_name":"Lee","city":"Oakland","skill_level":"intermediate"}'
```

Find players:

```sh
curl 'http://localhost:3000/api/users?city=Oakland&skill_level=intermediate'
```

Create a workout:

```sh
curl -X POST http://localhost:3000/api/workouts \
  -H 'content-type: application/json' \
  -H 'x-user-id: USER_UUID' \
  -d '{
    "title":"Doubles ladder night",
    "workout_type":"match",
    "duration_minutes":90,
    "calories":520,
    "occurred_at":"2026-07-11T19:30:00Z"
  }'
```

Post to the feed:

```sh
curl -X POST http://localhost:3000/api/posts \
  -H 'content-type: application/json' \
  -H 'x-user-id: USER_UUID' \
  -d '{"body":"Footwork finally clicked tonight."}'
```

Create and join a game invite:

```sh
curl -X POST http://localhost:3000/api/game-invites \
  -H 'content-type: application/json' \
  -H 'x-user-id: USER_UUID' \
  -d '{
    "title":"Saturday doubles",
    "venue":"Downtown Rec Center",
    "city":"Oakland",
    "starts_at":"2026-07-18T17:00:00Z",
    "skill_level":"intermediate",
    "max_players":8
  }'

curl -X POST http://localhost:3000/api/game-invites/GAME_INVITE_UUID/join \
  -H 'x-user-id: USER_UUID'
```

## Next Engineering Steps

1. Replace `x-user-id` with `better-auth` session extraction.
2. Add friendship/follow edges so the feed can move from global to social.
3. Add tests using SQLx against an ephemeral Postgres database.
4. Add richer workout stats for rallies, games, win/loss, partners, and opponents.
