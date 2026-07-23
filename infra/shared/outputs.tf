output "aws_region" {
  value = var.aws_region
}

output "ecr_registry" {
  value = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecr_repository" {
  value = aws_ecr_repository.api.name
}

output "publish_role_arn" {
  value = aws_iam_role.publish.arn
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
