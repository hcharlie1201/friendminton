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

## Prepare The Staging Server

Install Docker and create the deployment directory:

```sh
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu
mkdir -p /home/ubuntu/friendminton
```

Log out and back in after changing Docker group membership.

The API reads temporary Lightsail bucket credentials through the Instance Metadata Service. Permit
IMDSv2 responses to cross the container network hop:

```sh
aws lightsail update-instance-metadata-options \
  --instance-name YOUR_INSTANCE_NAME \
  --http-endpoint enabled \
  --http-tokens required \
  --http-put-response-hop-limit 2 \
  --region us-west-2
```

On the existing Lightsail instance, keep the environment file in the deployment directory:

```sh
cd /home/ubuntu/friendminton
mv .env.production .env.staging
```

Add or update these values in `.env.staging`:

```env
APP_ENV=staging
PUBLIC_BASE_URL=https://16.146.136.68.sslip.io
DOMAIN=16.146.136.68.sslip.io
AWS_REGION=us-west-2
GOOGLE_PLACES_API_KEY=replace-with-a-staging-google-places-key
S3_BUCKET=friendminton-media-us-west-2
```

Keep the existing database password and matching `DATABASE_URL`. Renaming the env file does not
change or reset the Docker `postgres_data` volume.

The deploy script does not upload a developer's local `.env`. It reads `.env.staging` or
`.env.production` from the deployment directory on the server and validates the file before
pulling an image. Keep `GOOGLE_PLACES_API_KEY` in that server-side file.

The workflow uploads `docker-compose.prod.yml` and `Caddyfile` into this directory. The server
does not build Rust or need GitHub repository credentials. It receives a temporary ECR login,
pulls the immutable image, starts Compose, and then discards the registry login.

## Terraform Infrastructure

Terraform owns the Lightsail, ECR, IAM/OIDC, and repository-level GitHub Actions variable
configuration. The states are separated into `shared`, `staging`, and `production` so a production
change cannot accidentally alter staging. See [`infra/README.md`](../infra/README.md) for state,
planning, import, and production provisioning instructions.

Initialize the shared stack from AWS and GitHub CLI sessions authenticated for the Friendminton
accounts:

```sh
aws sts get-caller-identity
gh auth status
cd infra/shared
terraform init -backend-config=../backend/shared.hcl
terraform plan
```

The shared stack manages:

- The GitHub Actions OIDC provider in IAM.
- The staging-only `friendminton-github-publish` role with push and pull access.
- The `friendminton-github-deploy` role, restricted to this repository's `staging` and `production`
  GitHub Environments, with pull-only access.
- The immutable `friendminton-api` ECR repository with push scanning enabled.
- Repository variables `AWS_REGION`, `AWS_PUBLISH_ROLE_ARN`, `AWS_DEPLOY_ROLE_ARN`, `ECR_REGISTRY`,
  and `ECR_REPOSITORY`.

The role can push and pull only this ECR repository. No permanent AWS access key is stored in
GitHub or on Lightsail.

## GitHub Environments

Create `staging` and `production` under **Repository settings > Environments**.

Configure these variables in each environment:

| Variable | Staging example | Production example |
| --- | --- | --- |
| `DEPLOY_PATH` | `/home/ubuntu/friendminton` | Production deployment path |
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
`DEPLOY_KNOWN_HOSTS`. Do not commit either file.

`DEPLOY_SSH_KEY` authenticates Actions to the Lightsail server. The staging workflow uses a separate
write-enabled GitHub deploy key, stored as the staging-only `RELEASE_SSH_KEY` secret, to authenticate
back to this repository and create annotated release tags. This avoids a broad personal access token
and is necessary when the tagged commit changes files in `.github/workflows`, which GitHub's built-in
Actions token cannot push. The release key is scoped only to this repository.

For `production`, configure required reviewers in the GitHub Environment.

## Workflow Behavior

- `CI` runs Rust formatting, Clippy, tests, mobile TypeScript, Compose validation, and a Docker build.
- `Deploy Staging` is manually dispatched with a source ref and a new version tag such as `v0.1.0`.
  It runs CI, builds the image on GitHub's runner, pushes an immutable SHA tag to ECR, deploys it,
  checks health, and only then creates the annotated Git tag.
- `Deploy Production` is manually dispatched with an existing version tag. It accepts annotated tags,
  resolves the immutable tagged commit, verifies its ECR image exists, and pauses for GitHub
  Environment approval before deploying the exact image already tested on staging.
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

The `infra/production` stack creates the isolated host, static IP, firewall, bucket attachment,
bucket safety settings, and required two-hop IMDS configuration. After applying its reviewed plan,
create `.env.production` from `.env.production.example` on the new host and perform one manual
deployment before enabling the GitHub workflow.
