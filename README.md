# Friendminton

Friendminton is a Rust/Axum MVP for a badminton community app inspired by Strava:
find nearby players, create game invites, track workouts, and share workout posts.

## Stack

- Axum for HTTP routing.
- SQLx for Postgres access, migrations, and dynamic SQL via `QueryBuilder`.
- Postgres with UUID primary keys and simple discovery indexes.
- OpenAPI via `aide` for generated mobile clients.

## Run Locally

```sh
cp .env.example .env
docker compose up -d postgres
DATABASE_URL=postgres://friendminton:friendminton@localhost:5432/friendminton cargo run
```

The app runs migrations automatically on startup.

Load three idempotent demo users, recorded workouts, and posts that exercise the
one-, two-, and three-photo layouts:

```sh
./scripts/seed-development.sh
```

This command only accepts a local development database. It copies the tracked demo
images into the ignored local `uploads/` directory and does not delete existing data.

## Runtime Configuration

Set `APP_ENV` to `development`, `staging`, or `production`. Non-secret defaults and third-party
provider choices live in `config/<environment>.toml`; deploy-specific values and secrets stay in
the matching uncommitted `.env` file. Environment variables take precedence over the profile.

Staging and production fail at startup unless `DATABASE_URL`, an HTTPS `PUBLIC_BASE_URL`,
`BETTER_AUTH_SECRET`, SES sender credentials/configuration, and S3 object storage are configured.
Google login additionally requires `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET`. Local development defaults to `EMAIL_PROVIDER=log`, which prints
verification and reset messages to the API terminal. The OpenAPI document uses `PUBLIC_BASE_URL`,
so generated clients point at the correct environment instead of always advertising localhost.

See [docs/deployment.md](docs/deployment.md) for the staging/production model, GitHub Environment
setup, CI/CD behavior, and the steps to designate the existing Lightsail instance as staging.

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
protected routes: signed-out users see the login screen, while signed-in users
store a revocable server session in `expo-secure-store`. The app validates that
session at startup and sends it as an `Authorization: Bearer` credential.

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

Create a user and request email verification:

```sh
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{
    "email":"lee@example.com",
    "password":"replace-with-a-test-password",
    "display_name":"Lee",
    "city":"Oakland",
    "skill_level":"intermediate"
  }'
```

In local development, open the verification URL printed by the API and confirm
the address. The signup response deliberately contains no session token.
Verified and returning users sign in with:

```sh
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"lee@example.com","password":"replace-with-a-test-password"}'
```

Use the `token` returned by sign-in for protected requests:

```sh
curl http://localhost:3000/api/auth/session \
  -H 'Authorization: Bearer SESSION_TOKEN'
```

Create a workout:

```sh
curl -X POST http://localhost:3000/api/workouts \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer SESSION_TOKEN' \
  -d '{
    "title":"Doubles ladder night",
    "workout_type":"match",
    "duration_milliseconds":5400000,
    "calories":520,
    "occurred_at":"2026-07-11T19:30:00Z"
  }'
```

Post to the feed:

```sh
curl -X POST http://localhost:3000/api/posts \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer SESSION_TOKEN' \
  -d '{"workout_id":"WORKOUT_UUID","body":"Footwork finally clicked tonight."}'
```

Create and join a game invite:

```sh
curl -X POST http://localhost:3000/api/game-invites \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer SESSION_TOKEN' \
  -d '{
    "title":"Saturday doubles",
    "venue":"Downtown Rec Center",
    "city":"Oakland",
    "starts_at":"2026-07-18T17:00:00Z",
    "skill_level":"intermediate",
    "max_players":8
  }'

curl -X POST http://localhost:3000/api/game-invites/GAME_INVITE_UUID/join \
  -H 'Authorization: Bearer SESSION_TOKEN'
```

## MVP Roadmap

The ordered public-MVP plan and current implementation status live in
[`docs/mvp-roadmap.md`](docs/mvp-roadmap.md).
