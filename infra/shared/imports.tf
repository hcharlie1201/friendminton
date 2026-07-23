import {
  to = aws_iam_openid_connect_provider.github
  id = "arn:aws:iam::973118666773:oidc-provider/token.actions.githubusercontent.com"
}

import {
  to = aws_ecr_repository.api
  id = "friendminton-api"
}

import {
  to = aws_iam_role.publish
  id = "friendminton-github-publish"
}

import {
  to = aws_iam_role_policy.publish
  id = "friendminton-github-publish:FriendmintonEcrPublish"
}

import {
  to = aws_iam_role.deploy
  id = "friendminton-github-deploy"
}

import {
  to = aws_iam_role_policy.deploy
  id = "friendminton-github-deploy:FriendmintonEcrPull"
}

import {
  for_each = local.repository_variables
  to       = github_actions_variable.deployment[each.key]
  id       = "${var.github_repository}:${each.key}"
}
