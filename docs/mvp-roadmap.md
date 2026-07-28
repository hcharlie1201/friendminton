# Friendminton MVP roadmap

Last updated: 2026-07-27

This document is the persistent source of truth for the public-MVP sequence. It
should be loaded before MVP work and updated as implementation lands.

## Current focus

**Step 2 — validate Sign in with Apple, then implement account deletion.** Native
Apple credential exchange, server-side token validation, safe account linking,
encrypted refresh-token storage, and the iOS login surface are implemented locally.
Apple Developer credentials, a new native build, and a TestFlight smoke test remain
before Apple login ships. Account deletion has not started.

### Finish Step 1 runbook

Staging sections B–E are complete. Section A remains the public-launch email gate.

**A. SES infrastructure** (see [`infra/email/README.md`](../infra/email/README.md))

1. `cd infra/email && terraform init -backend-config=../backend/email.hcl && terraform plan -out=email.tfplan && terraform apply email.tfplan`
2. `terraform output -json required_dns_records` → publish every DKIM, MAIL FROM, SPF, and
   DMARC record at the DNS provider for `friendminton.com`.
3. Confirm both identities: `aws sesv2 get-email-identity --region us-west-2 --email-identity staging.friendminton.com` (and production) until `VerificationStatus` is `SUCCESS`.
4. Optional: set `alert_email` in `terraform.tfvars`, apply, confirm the SNS subscription.
5. Before public signup, request SES production access in `us-west-2`
   (`put-account-details`) and wait for approval. A Google Workspace account is not
   required; AWS accepts a monitored contact address such as Gmail.
6. Create staging sender credentials: `aws iam create-access-key --user-name friendminton-staging-ses-sender` (secret shown once).

**B. Staging server secrets** (see [`docs/deployment.md`](deployment.md))

1. SSH to the staging Lightsail host and edit `/home/ubuntu/friendminton/.env.staging`.
2. Set `BETTER_AUTH_SECRET` (`openssl rand -base64 48`), Google OAuth client ID/secret, and
   all `SES_*` values from the Terraform outputs. Keep `EMAIL_PROVIDER=ses`.
3. Register the exact Google redirect URI:
   `https://16.146.136.68.sslip.io/api/auth/callback/google`
4. `chmod 600 .env.staging`

**C. API deploy**

1. Ensure CI is green on `main`.
2. Dispatch **Deploy Staging** with a new tag (e.g. `v0.2.0`). The workflow builds the
   image, pushes to ECR, deploys via SSH, and checks `/healthz`.
3. Verify auth endpoints respond on staging (signup should return `verification_required: true`).

**D. Mobile TestFlight build**

1. Create `mobile/.env.staging.local` from `mobile/.env.staging.example` with the staging API URL.
2. Rebuild the **development client** if native modules changed since the last build:
   `cd mobile && pnpm ios`
3. Build for TestFlight: `cd mobile && pnpm testflight:build`
4. Submit: `pnpm testflight:submit`

**E. Smoke test on TestFlight** (all must pass)

- [x] New email/password signup → verification email received → confirm → sign in
- [x] Duplicate signup on same email → conflict, profile unchanged
- [x] Returning sign-in after app restart → session restored
- [x] Forgot password → reset email → set new password → sign in
- [x] Google sign-in → lands back in app without token in URL
- [x] Protected API call works with bearer token; `x-user-id` alone returns 401
- [x] Sign out → protected routes redirect to login

**F. Mark Step 1 complete**

Update the status table below and move current focus to Step 2.

## Status

| Step | Deliverable | Status |
| --- | --- | --- |
| 1 | Real authentication, sessions, Google login, and returning-user login | Staging complete; SES public-send access deferred |
| 2 | Sign in with Apple and in-app account deletion | In progress; Apple login implemented locally |
| 3 | Unified discovery and search | Not started |
| 4 | Complete group and gathering membership flows | Not started |
| 5 | Minimal gathering and group chat | Not started |
| 6 | Event-driven notifications, push, and transactional email | Not started; SES foundation ready |
| 7 | Editable profiles, reporting, blocking, and moderation | Not started |
| 8 | Standalone manual activities; explicitly decide phone tracking scope | Not started |

## Step 1 — real authentication and sessions

### Scope

- Integrate Better Auth Rust with PostgreSQL and Axum.
- Add email/password sign-up and returning-user sign-in.
- Add Google OAuth initiation, callback, account linking, and a secure mobile
  callback exchange.
- Store only a revocable session token and the authenticated user summary in
  Expo SecureStore.
- Send `Authorization: Bearer <session-token>` on protected API calls.
- Replace the trusted `x-user-id` extractor with validated session lookup.
- Preserve existing product-user UUIDs by linking verified OAuth identities by
  normalized email. Do not let password signup claim a legacy email.
- Add sign-out, session restoration, expiry handling, and protected-route tests.
- Document required `BETTER_AUTH_SECRET`, Google OAuth client, callback URL, and mobile
  deep-link configuration for development, staging, and production.

### Acceptance criteria

- A new email/password user can create an account, verify the address, and then
  receive a revocable server session.
- A returning user can sign in, restart the app, restore the session, and sign out.
- Google OAuth returns to the installed app without putting the session token in
  the callback URL.
- Missing, expired, revoked, or fabricated bearer tokens receive `401`.
- Supplying `x-user-id` alone never authenticates a request.
- Existing relational data continues to resolve to the same product-user UUID.
- Backend tests and mobile typechecking pass.

### Implementation progress

- [x] Preserve existing product-user UUIDs while adding Better Auth users,
  accounts, sessions, and normalized unique emails.
- [x] Add email/password signup, returning-user signin, session restoration,
  sign-out, and duplicate-email errors.
- [x] Replace trusted `x-user-id` authentication with validated bearer sessions.
- [x] Add Google OAuth start/callback/exchange with native PKCE and a single-use
  code so the session token never appears in a callback URL.
- [x] Store the session in SecureStore and attach it through the generated API
  client.
- [x] Add protected-route, duplicate-email, restore/revoke, forged-header, and
  single-use exchange tests.
- [x] Prevent a pre-registered, unverified password credential from remaining
  attached when the verified Google email owner signs in.
- [x] Add enumeration-safe email verification and password reset with hashed,
  expiring, single-use tokens; enforce verification before session use.
- [x] Add mobile verification, resend, forgot-password, and reset-password
  screens with cold custom-scheme link handling.
- [x] Add SES sending code plus Terraform for DKIM identities, custom MAIL FROM,
  bounce/complaint suppression, delivery event logs, and reputation alarms.
- [ ] Before public signup, apply/verify the remaining SES infrastructure,
  confirm alarm delivery, and obtain SES production access in `us-west-2`.
  This is deferred while production rollout is out of scope.
- [x] Configure staging auth/SES secrets and the exact Google redirect URI.
- [x] Deploy the API and a newly built mobile binary as one staging cutover.
- [x] Smoke-test new signup, verification, duplicate signup, returning login,
  forgot/reset password, Google login, app restart, protected API access, and
  sign-out on TestFlight.
- [x] Forward a trusted client address into auth throttling before the public
  production rollout so one client cannot consume a shared rate-limit bucket.
  Caddy's `X-Forwarded-For` (rightmost entry) is forwarded into Better Auth
  rate-limit keys on signup, signin, and Google OAuth paths.

### Deferred from Step 1

- Sign in with Apple and account deletion, which are Step 2.
- Organization auth from Better Auth; Friendminton groups remain product-domain
  groups.

## Step 2 — Apple login and account deletion

### Scope

- Add Sign in with Apple as an equivalent login option on iOS.
- Link Apple, Google, and email credentials to one product user safely.
- Add an in-app, reauthenticated account-deletion flow.
- Delete or anonymize associated profile and user-generated data according to
  the product retention policy, and revoke provider/session tokens.

### Acceptance criteria

- Apple review requirements for third-party login and account deletion are met.
- Deletion is discoverable in settings, requires confirmation, and is covered by
  integration tests.

### Implementation progress

- [x] Add server-issued, expiring, one-use Apple nonce challenges.
- [x] Validate Apple identity-token signatures, issuer, audience, expiry, nonce,
  subject, and verified email using cached Apple JWKS.
- [x] Exchange the native authorization code, encrypt provider tokens, safely
  link matching verified emails, preserve product UUIDs, and issue revocable sessions.
- [x] Hold unknown Apple identities as short-lived pending sign-ins and require an
  explicit choice to create a new account or reauthenticate an existing email/Google
  account before linking, preventing silent private-relay duplicates.
- [x] Add the native iOS Apple button and capability with generated API bindings.
- [x] Cover invalid claims, key rotation, one-use challenges, returning login,
  private relay separation, credential cleanup, and session restoration in tests.
- [ ] Configure the Apple Developer key and staging environment variables.
- [ ] Build and smoke-test Apple login on a real-device development build and TestFlight.
- [ ] Design and implement reauthenticated account deletion and provider revocation.

## Step 3 — unified discovery and search

### Scope

- Provide category search for games, courts, groups, and players.
- Wire existing court/group query support and add gathering text search.
- Persist the selected discovery location instead of resetting to Oakland.
- Move active search results above discovery carousels.
- Add server-side filters and cursor pagination.
- Seed or curate enough court/group/game data for one launch city.

### Acceptance criteria

- One query can be narrowed by category and produces useful, paginated results.
- Changing or restarting the app does not unexpectedly reset location.
- Loading, empty, and failure states are distinguishable and retryable.

## Step 4 — membership and host controls

### Scope

- Add group Join/Request/Leave controls and visible membership state.
- Add gathering participant lists and Leave.
- Add host invite, approve, reject, remove, and cancel controls.
- Hide invite-only or approval-required policies until their complete flows ship.

### Acceptance criteria

- Every membership policy exposed by the UI can complete end to end.
- Capacity and authorization are enforced transactionally and tested.

## Step 5 — minimal chat

### Scope

- Add text-only conversations attached to gatherings and groups.
- Add authorized message history with cursor pagination, send, unread counts,
  and simple polling.
- Include block/report affordances from the first release.

### Acceptance criteria

- Only eligible members can read or send messages.
- Conversation history, retries, duplicate-send protection, and unread state
  work across app restarts.

### Deferred

- Attachments, reactions, typing indicators, read receipts, WebSockets, and
  unrestricted direct messages.

## Step 6 — notifications, push, and email

### Scope

- Replace seeded demo notifications with domain events for messages, membership,
  and gathering changes.
- Register and revoke Expo push tokens per installation.
- Deliver deep-linked push notifications and process provider receipts.
- Extend the Step 1 SES foundation from verification/password reset to
  invitations and other important transactional mail.
- Add managed templates and per-event delivery policy on top of the verified
  identities and bounce/complaint handling.

### Acceptance criteria

- Each supported event is idempotent, appears in-app, and optionally reaches push
  or email according to user preferences.
- Invalid device tokens and suppressed email recipients are handled safely.

## Step 7 — profiles and moderation

### Scope

- Let users edit display name, city, skill, bio, and avatar.
- Add user/content reporting, blocking, content filtering, and support contact
  information.
- Add the minimum admin review/removal workflow and audit trail.

### Acceptance criteria

- Profile changes are authorized and reflected throughout the app.
- Blocking prevents relevant discovery, profile, and chat interactions.
- Reports can be reviewed and resolved.

## Step 8 — activities and phone tracking decision

### Scope

- Add standalone manual activity creation with type, date, duration, and notes.
- Make the feed contract for manual versus gathering-linked workouts explicit.
- Run a product/technical spike before committing to phone timers, background
  recording, sensors, or HealthKit.

### Acceptance criteria

- Users can create, view, edit, and delete a manual activity.
- Phone tracking is either explicitly deferred or has a separately approved
  permission, privacy, battery, and background-execution design.

## Cross-cutting release gates

- CI: `cargo fmt --check`, `cargo clippy --all-targets --all-features`,
  `cargo test`, and `pnpm --dir mobile typecheck`.
- Operations: persistent application logs, mobile crash reporting, uptime alerts,
  automatic database backups, and a tested restore procedure.
- Security: secrets stay outside Git, protected routes fail closed, and new
  externally supplied identifiers receive authorization tests.
- Rollout: validate on development, deploy to staging, complete a TestFlight
  smoke test, then promote the exact tested image/build to production.
