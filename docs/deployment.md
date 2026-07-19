# Environments And Deployment

Friendminton has three runtime environments:

| Environment | Purpose | Configuration | Deployment |
| --- | --- | --- | --- |
| `development` | Local API and Expo development | `config/development.toml` + `.env` | Manual |
| `staging` | Shared beta/testing server | `config/staging.toml` + `.env.staging` | Manual release candidate workflow |
| `production` | Public app data and traffic | `config/production.toml` + `.env.production` | Manual tagged release workflow |

The TOML profiles contain non-secret defaults and third-party provider choices. Environment
variables override profile values. Passwords, private keys, and provider credentials must never
be committed.

## Convert The Current Server To Staging

On the existing Lightsail instance:

```sh
cd /path/to/friendminton/friendminton
mv .env.production .env.staging
```

Add or update these values in `.env.staging`:

```env
APP_ENV=staging
PUBLIC_BASE_URL=https://16.146.136.68.sslip.io
DOMAIN=16.146.136.68.sslip.io
AWS_REGION=us-west-2
S3_BUCKET=friendminton-media-us-west-2
```

Keep the existing database password and matching `DATABASE_URL`. Renaming the env file does not
change or reset the Docker `postgres_data` volume.

After pulling this configuration change, verify it manually once:

```sh
docker compose --env-file .env.staging -f docker-compose.prod.yml up -d --build
curl --fail https://16.146.136.68.sslip.io/healthz
```

## GitHub Environments

Create `staging` and `production` under **Repository settings > Environments**.

Configure these variables in each environment:

| Variable | Staging example | Production example |
| --- | --- | --- |
| `DEPLOY_PATH` | `/home/ubuntu/friendminton/friendminton` | Production checkout path |
| `DEPLOY_USER` | `ubuntu` | `ubuntu` |
| `PUBLIC_BASE_URL` | `https://16.146.136.68.sslip.io` | `https://api.friendminton.com` |

Configure these secrets in each environment:

| Secret | Meaning |
| --- | --- |
| `DEPLOY_HOST` | Public IP or DNS name of that environment's server |
| `DEPLOY_SSH_KEY` | Private key dedicated to GitHub deployment access |
| `DEPLOY_KNOWN_HOSTS` | Pinned `known_hosts` line for the deployment host |

Generate a dedicated deployment key locally:

```sh
ssh-keygen -t ed25519 -f friendminton_deploy -C friendminton-github-actions
ssh-copy-id -i friendminton_deploy.pub ubuntu@STAGING_HOST
ssh-keyscan -H STAGING_HOST
```

Store the private key contents as `DEPLOY_SSH_KEY` and the reviewed `ssh-keyscan` output as
`DEPLOY_KNOWN_HOSTS`. Do not commit either file. The server checkout must already have read access
to this GitHub repository so `git fetch` works during deployment.

For `production`, configure required reviewers in the GitHub Environment.

## Workflow Behavior

- `CI` runs Rust formatting, Clippy, tests, mobile TypeScript, Compose validation, and a Docker build.
- `Deploy Staging` is manually dispatched with a source ref and a new version tag such as `v0.1.0`.
  It runs CI against the resolved commit, deploys that exact SHA, checks health, and only then creates
  the annotated Git tag.
- `Deploy Production` is manually dispatched with an existing version tag. It accepts annotated tags,
  resolves the immutable tagged commit, and pauses for GitHub Environment approval before deployment.
- Both deployment workflows run an HTTPS health check after Compose starts the new API.

GitHub does not support dynamically populated workflow `choice` inputs, so the production workflow
uses a validated tag text field. From the CLI, the same deployment is:

```sh
gh workflow run deploy-production.yml -f tag=v0.1.0
```

## Production Isolation

Production should use a separate Lightsail instance, PostgreSQL volume, object-storage bucket,
domain, deployment SSH key, and GitHub Environment secrets. Never point production at the staging
database or `friendminton-media-us-west-2` bucket.

On the future production host, create `.env.production` from `.env.production.example`, attach the
production bucket, configure the same two-hop IMDS setting described in the README, and perform one
manual deployment before enabling the GitHub workflow.
