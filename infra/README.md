# Friendminton Infrastructure

Terraform owns Friendminton's AWS infrastructure and the repository-level GitHub Actions variables
that point deployments at AWS. Application images and releases remain owned by GitHub Actions.

## State layout

Each stack has an independent state object in the encrypted, versioned, private
`friendminton-terraform-state-973118666773` S3 bucket:

| Stack | Owns |
| --- | --- |
| `state-bootstrap` | Terraform state bucket and its safety settings |
| `shared` | ECR, GitHub OIDC, IAM deployment roles, repository Actions variables |
| `staging` | Existing staging Lightsail instance, static IP, firewall, and media bucket |
| `production` | Isolated production Lightsail instance, static IP, firewall, and media bucket |

The staging and shared import blocks are intentionally retained as migration history. Once an
address is in state, Terraform treats the matching import block as a no-op.

## Normal workflow

Authenticate both CLIs, initialize the stack, and review a saved plan before applying it:

```sh
aws sts get-caller-identity
gh auth status
cd infra/staging
terraform init -backend-config=../backend/staging.hcl
terraform fmt -check -recursive ..
terraform validate
terraform plan -out=staging.tfplan
terraform apply staging.tfplan
```

Use the matching backend file for the other stacks. Do not use `-target` for routine changes, and
never commit plan files, state files, `.terraform/`, or `terraform.tfvars`.

## Production provisioning

Production requires a production-only SSH deploy key. Generate it outside Terraform and put only
its public half in an uncommitted `terraform.tfvars`:

```sh
ssh-keygen -t ed25519 -f friendminton_production_deploy -C friendminton-production-github-actions
cp terraform.tfvars.example terraform.tfvars
```

Replace `deploy_public_key` with the contents of `friendminton_production_deploy.pub`. Review the
plan carefully:

```sh
cd infra/production
terraform init -backend-config=../backend/production.hcl
terraform plan -out=production.tfplan
```

Applying that plan creates a new instance, object-storage bucket, and IP; it does not reuse staging
data. Docker Compose creates the production PostgreSQL volume during the first deployment. After
apply:

1. Put the private key in the production GitHub Environment as `DEPLOY_SSH_KEY`.
2. Put the reviewed host key in `DEPLOY_KNOWN_HOSTS`.
3. Set `DEPLOY_HOST` to the `public_ip` output.
4. Create `/home/ubuntu/friendminton/.env.production` with production-only database and provider secrets.
5. Set `S3_BUCKET` to the `bucket_name` output and perform the first tagged production deployment.

Terraform state contains infrastructure metadata and the public SSH key, but no application secrets
or SSH private keys.

## Provider gaps

The AWS provider does not currently expose Lightsail bucket versioning/access rules or instance
metadata options. The environment module applies those settings idempotently when it adopts or
creates each resource, but Terraform cannot detect later console drift for those fields. Audit them
periodically with `aws lightsail get-buckets --include-connected-resources` and
`aws lightsail get-instance`. The CLI must be installed and authenticated wherever
`terraform apply` runs.
