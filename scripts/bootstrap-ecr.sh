#!/usr/bin/env bash

set -euo pipefail

AWS_REGION="${AWS_REGION:-us-west-2}"
ECR_REPOSITORY="${ECR_REPOSITORY:-friendminton-api}"
GITHUB_OWNER="${GITHUB_OWNER:-hcharlie1201}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-friendminton}"
IAM_DEPLOY_ROLE_NAME="${IAM_DEPLOY_ROLE_NAME:-friendminton-github-deploy}"
IAM_PUBLISH_ROLE_NAME="${IAM_PUBLISH_ROLE_NAME:-friendminton-github-publish}"

for command in aws gh jq; do
  command -v "$command" >/dev/null || {
    printf 'Required command is not installed: %s\n' "$command" >&2
    exit 1
  }
done

aws sts get-caller-identity >/dev/null
gh auth status >/dev/null

aws_account_id="$(aws sts get-caller-identity --query Account --output text)"
oidc_provider_arn="arn:aws:iam::${aws_account_id}:oidc-provider/token.actions.githubusercontent.com"
ecr_registry="${aws_account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
deploy_role_arn="arn:aws:iam::${aws_account_id}:role/${IAM_DEPLOY_ROLE_NAME}"
publish_role_arn="arn:aws:iam::${aws_account_id}:role/${IAM_PUBLISH_ROLE_NAME}"
repository_arn="arn:aws:ecr:${AWS_REGION}:${aws_account_id}:repository/${ECR_REPOSITORY}"

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

if ! aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "$oidc_provider_arn" >/dev/null 2>&1; then
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com >/dev/null
fi

oidc_audience="$(aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "$oidc_provider_arn" \
  --query 'ClientIDList[?@ == `sts.amazonaws.com`] | [0]' \
  --output text)"
if [[ "$oidc_audience" != "sts.amazonaws.com" ]]; then
  aws iam add-client-id-to-open-id-connect-provider \
    --open-id-connect-provider-arn "$oidc_provider_arn" \
    --client-id sts.amazonaws.com
fi

jq -n \
  --arg provider "$oidc_provider_arn" \
  --arg subject "repo:${GITHUB_OWNER}/${GITHUB_REPOSITORY}:environment:staging" \
  '{
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: {Federated: $provider},
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": $subject
        }
      }
    }]
  }' > "$temporary_directory/publish-trust-policy.json"

jq -n \
  --arg provider "$oidc_provider_arn" \
  --arg staging_subject "repo:${GITHUB_OWNER}/${GITHUB_REPOSITORY}:environment:staging" \
  --arg production_subject "repo:${GITHUB_OWNER}/${GITHUB_REPOSITORY}:environment:production" \
  '{
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: {Federated: $provider},
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [$staging_subject, $production_subject]
        }
      }
    }]
  }' > "$temporary_directory/deploy-trust-policy.json"

jq -n \
  --arg repository "$repository_arn" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "EcrAuthentication",
        Effect: "Allow",
        Action: "ecr:GetAuthorizationToken",
        Resource: "*"
      },
      {
        Sid: "FriendmintonImagePushPull",
        Effect: "Allow",
        Action: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ],
        Resource: $repository
      }
    ]
  }' > "$temporary_directory/publish-permissions-policy.json"

jq -n \
  --arg repository "$repository_arn" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "EcrAuthentication",
        Effect: "Allow",
        Action: "ecr:GetAuthorizationToken",
        Resource: "*"
      },
      {
        Sid: "FriendmintonImagePull",
        Effect: "Allow",
        Action: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer"
        ],
        Resource: $repository
      }
    ]
  }' > "$temporary_directory/deploy-permissions-policy.json"

ensure_role() {
  local role_name="$1"
  local description="$2"
  local trust_policy="$3"
  local policy_name="$4"
  local permissions_policy="$5"

  if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
    aws iam update-assume-role-policy \
      --role-name "$role_name" \
      --policy-document "file://$trust_policy"
  else
    aws iam create-role \
      --role-name "$role_name" \
      --description "$description" \
      --assume-role-policy-document "file://$trust_policy" >/dev/null
  fi

  aws iam put-role-policy \
    --role-name "$role_name" \
    --policy-name "$policy_name" \
    --policy-document "file://$permissions_policy"
}

ensure_role \
  "$IAM_PUBLISH_ROLE_NAME" \
  "Publish Friendminton ECR images from the staging GitHub Environment" \
  "$temporary_directory/publish-trust-policy.json" \
  FriendmintonEcrPublish \
  "$temporary_directory/publish-permissions-policy.json"

ensure_role \
  "$IAM_DEPLOY_ROLE_NAME" \
  "Deploy Friendminton ECR images from GitHub Environments" \
  "$temporary_directory/deploy-trust-policy.json" \
  FriendmintonEcrPull \
  "$temporary_directory/deploy-permissions-policy.json"

if ! aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$ECR_REPOSITORY" >/dev/null 2>&1; then
  aws ecr create-repository \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY" \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability IMMUTABLE >/dev/null
fi

aws ecr put-image-tag-mutability \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-tag-mutability IMMUTABLE >/dev/null
aws ecr put-image-scanning-configuration \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-scanning-configuration scanOnPush=true >/dev/null

gh variable set AWS_REGION --body "$AWS_REGION"
gh variable set AWS_DEPLOY_ROLE_ARN --body "$deploy_role_arn"
gh variable set AWS_PUBLISH_ROLE_ARN --body "$publish_role_arn"
gh variable set ECR_REGISTRY --body "$ecr_registry"
gh variable set ECR_REPOSITORY --body "$ECR_REPOSITORY"

printf '\nECR deployment infrastructure is ready.\n'
printf 'AWS account:    %s\n' "$aws_account_id"
printf 'Publish role:   %s\n' "$publish_role_arn"
printf 'Deploy role:    %s\n' "$deploy_role_arn"
printf 'ECR repository: %s/%s\n' "$ecr_registry" "$ECR_REPOSITORY"
printf 'GitHub repo:    %s/%s\n' "$GITHUB_OWNER" "$GITHUB_REPOSITORY"
