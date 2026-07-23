data "aws_iam_policy_document" "publish_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_owner}/${var.github_repository}:environment:staging"]
    }
  }
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_owner}/${var.github_repository}:environment:staging",
        "repo:${var.github_owner}/${var.github_repository}:environment:production",
      ]
    }
  }
}

data "aws_iam_policy_document" "publish" {
  statement {
    sid       = "EcrAuthentication"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "FriendmintonImagePushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.api.arn]
  }
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuthentication"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "FriendmintonImagePull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.api.arn]
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ab9d0263244dd0326eb67015705a667e79cfe998"]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "api" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role" "publish" {
  name               = "friendminton-github-publish"
  description        = "Publish Friendminton ECR images from the staging GitHub Environment"
  assume_role_policy = data.aws_iam_policy_document.publish_trust.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "publish" {
  name   = "FriendmintonEcrPublish"
  role   = aws_iam_role.publish.id
  policy = data.aws_iam_policy_document.publish.json
}

resource "aws_iam_role" "deploy" {
  name               = "friendminton-github-deploy"
  description        = "Deploy Friendminton ECR images from GitHub Environments"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "FriendmintonEcrPull"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

locals {
  repository_variables = {
    AWS_REGION           = var.aws_region
    AWS_DEPLOY_ROLE_ARN  = aws_iam_role.deploy.arn
    AWS_PUBLISH_ROLE_ARN = aws_iam_role.publish.arn
    ECR_REGISTRY         = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
    ECR_REPOSITORY       = aws_ecr_repository.api.name
  }
}

resource "github_actions_variable" "deployment" {
  for_each = local.repository_variables

  repository    = var.github_repository
  variable_name = each.key
  value         = each.value
}
