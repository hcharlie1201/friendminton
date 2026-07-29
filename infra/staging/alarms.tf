locals {
  aws_account_id = "973118666773"
  aws_region     = "us-west-2"

  sns_topic_policy_actions = [
    "sns:AddPermission",
    "sns:DeleteTopic",
    "sns:GetTopicAttributes",
    "sns:ListSubscriptionsByTopic",
    "sns:Publish",
    "sns:RemovePermission",
    "sns:SetTopicAttributes",
    "sns:Subscribe",
  ]
}

resource "aws_sns_topic" "staging_alerts" {
  name = "friendminton-staging-alerts"
}

resource "aws_sns_topic_policy" "staging_alerts" {
  arn = aws_sns_topic.staging_alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AccountAdministration"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.aws_account_id}:root"
        }
        Action   = local.sns_topic_policy_actions
        Resource = aws_sns_topic.staging_alerts.arn
      },
      {
        Sid    = "CloudWatchAlarmPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.staging_alerts.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:cloudwatch:${local.aws_region}:${local.aws_account_id}:alarm:friendminton-staging-*"
          }
          StringEquals = {
            "aws:SourceAccount" = local.aws_account_id
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = local.sns_topic_policy_actions
        Resource  = aws_sns_topic.staging_alerts.arn
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

resource "aws_sns_topic_subscription" "operator_email" {
  count = var.alert_email == null ? 0 : 1

  topic_arn = aws_sns_topic.staging_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "friendminton-staging-cpu-utilization"
  alarm_description   = "Staging Lightsail CPUUtilization is above 90 percent."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/Lightsail"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.staging_alerts.arn]
  ok_actions          = [aws_sns_topic.staging_alerts.arn]

  dimensions = {
    InstanceName = module.environment.instance_name
  }

  depends_on = [aws_sns_topic_policy.staging_alerts]
}

resource "aws_cloudwatch_metric_alarm" "memory_utilization" {
  alarm_name          = "friendminton-staging-memory-utilization"
  alarm_description   = "Staging Lightsail MemoryUtilization is above 80 percent."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/Lightsail"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.staging_alerts.arn]
  ok_actions          = [aws_sns_topic.staging_alerts.arn]

  dimensions = {
    InstanceName = module.environment.instance_name
  }

  depends_on = [aws_sns_topic_policy.staging_alerts]
}
