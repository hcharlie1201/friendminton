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

## OpenAPI

The generated API contract is available at:

```sh
curl http://localhost:3000/openapi.json
```

Swagger UI is available in the browser at:

```text
http://localhost:3000/swagger-ui
```

Generate a TypeScript client for React Native:

```sh
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/openapi.json \
  -g typescript-fetch \
  -o mobile/src/api/generated
```

Keep generated files behind a small app-owned wrapper that adds the API base URL and auth headers.

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
