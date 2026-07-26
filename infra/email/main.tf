locals {
  common_tags = {
    Project   = "friendminton"
    ManagedBy = "terraform"
    Component = "transactional-email"
  }

  environments = {
    staging = {
      configuration_set_name = "friendminton-staging-transactional"
      identity_domain        = var.staging_domain
      mail_from_domain       = "bounce.${var.staging_domain}"
      from_address           = "no-reply@${var.staging_domain}"
      sender_user_name       = "friendminton-staging-ses-sender"
    }
    production = {
      configuration_set_name = "friendminton-production-transactional"
      identity_domain        = var.root_domain
      mail_from_domain       = "bounce.${var.root_domain}"
      from_address           = "no-reply@${var.root_domain}"
      sender_user_name       = "friendminton-production-ses-sender"
    }
  }

  published_event_types = [
    "SEND",
    "REJECT",
    "BOUNCE",
    "COMPLAINT",
    "DELIVERY",
    "RENDERING_FAILURE",
    "DELIVERY_DELAY",
  ]

  event_detail_types = [
    "Email Sent",
    "Email Rejected",
    "Email Bounced",
    "Email Complaint Received",
    "Email Delivered",
    "Email Rendering Failed",
    "Email Delivery Delayed",
  ]

  # SNS topic resource policies reject the service wildcard even though
  # identity-based IAM policies accept it. Keep this list to the explicit
  # topic-scoped actions supported by SNS.
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

  default_event_bus_arn = "arn:aws:events:${var.aws_region}:${var.aws_account_id}:event-bus/default"
}

resource "aws_sesv2_account_suppression_attributes" "this" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

resource "aws_sesv2_configuration_set" "transactional" {
  for_each = local.environments

  configuration_set_name = each.value.configuration_set_name

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  tags = {
    Environment = each.key
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sesv2_email_identity" "sender" {
  for_each = local.environments

  email_identity         = each.value.identity_domain
  configuration_set_name = aws_sesv2_configuration_set.transactional[each.key].configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }

  tags = {
    Environment = each.key
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "sender" {
  for_each = local.environments

  email_identity         = aws_sesv2_email_identity.sender[each.key].email_identity
  mail_from_domain       = each.value.mail_from_domain
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_cloudwatch_log_group" "ses_events" {
  for_each = local.environments

  name              = "/aws/events/friendminton/ses/${each.key}"
  retention_in_days = 30

  tags = {
    Environment = each.key
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_event_rule" "ses_events" {
  for_each = local.environments

  name           = "friendminton-ses-${each.key}-events"
  description    = "Capture Friendminton ${each.key} transactional email delivery events."
  event_bus_name = "default"

  event_pattern = jsonencode({
    source        = ["aws.ses"]
    "detail-type" = local.event_detail_types
    detail = {
      mail = {
        tags = {
          "ses:configuration-set" = [each.value.configuration_set_name]
        }
      }
    }
  })

  tags = {
    Environment = each.key
  }
}

resource "aws_cloudwatch_log_resource_policy" "ses_events" {
  for_each = local.environments

  resource_arn = aws_cloudwatch_log_group.ses_events[each.key].arn
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CreateEventLogStream"
        Effect = "Allow"
        Principal = {
          Service = [
            "events.amazonaws.com",
            "delivery.logs.amazonaws.com",
          ]
        }
        Action   = "logs:CreateLogStream"
        Resource = "${aws_cloudwatch_log_group.ses_events[each.key].arn}:*"
      },
      {
        Sid    = "WriteEventLogs"
        Effect = "Allow"
        Principal = {
          Service = [
            "events.amazonaws.com",
            "delivery.logs.amazonaws.com",
          ]
        }
        Action   = "logs:PutLogEvents"
        Resource = "${aws_cloudwatch_log_group.ses_events[each.key].arn}:*:*"
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.ses_events[each.key].arn
          }
        }
      },
    ]
  })
}

resource "aws_cloudwatch_event_target" "ses_events" {
  for_each = local.environments

  event_bus_name = "default"
  rule           = aws_cloudwatch_event_rule.ses_events[each.key].name
  target_id      = "CloudWatchLogs"
  arn            = aws_cloudwatch_log_group.ses_events[each.key].arn

  depends_on = [aws_cloudwatch_log_resource_policy.ses_events]
}

resource "aws_sesv2_configuration_set_event_destination" "events" {
  for_each = local.environments

  configuration_set_name = aws_sesv2_configuration_set.transactional[each.key].configuration_set_name
  event_destination_name = "eventbridge"

  event_destination {
    enabled              = true
    matching_event_types = local.published_event_types

    event_bridge_destination {
      event_bus_arn = local.default_event_bus_arn
    }
  }
}

resource "aws_sesv2_email_identity_feedback_attributes" "sender" {
  for_each = local.environments

  email_identity           = aws_sesv2_email_identity.sender[each.key].email_identity
  email_forwarding_enabled = false

  depends_on = [
    aws_cloudwatch_event_target.ses_events,
    aws_sesv2_configuration_set_event_destination.events,
  ]
}

resource "aws_iam_user" "ses_sender" {
  for_each = local.environments

  name = each.value.sender_user_name
  path = "/friendminton/"

  tags = {
    Environment = each.key
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_user_policy" "ses_sender" {
  for_each = local.environments

  name = "FriendmintonSesSendEmail"
  user = aws_iam_user.ses_sender[each.key].name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendFromFriendmintonIdentity"
        Effect = "Allow"
        Action = "ses:SendEmail"
        Resource = [
          aws_sesv2_email_identity.sender[each.key].arn,
          aws_sesv2_configuration_set.transactional[each.key].arn,
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "true"
          }
          StringEquals = {
            "ses:FromAddress"     = each.value.from_address
            "ses:FromDisplayName" = "Friendminton"
          }
        }
      },
      {
        Sid      = "DenyInsecureTransport"
        Effect   = "Deny"
        Action   = "ses:*"
        Resource = "*"
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

resource "aws_sns_topic" "ses_alerts" {
  # Alarm payloads contain reputation metrics, not SES message bodies. Do not
  # enable alias/aws/sns here: AWS service publishers such as CloudWatch need a
  # customer-managed KMS policy, and the AWS-managed key would silently block
  # these alarm notifications.
  name = "friendminton-ses-alerts"
}

resource "aws_sns_topic_policy" "ses_alerts" {
  arn = aws_sns_topic.ses_alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AccountAdministration"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Action   = local.sns_topic_policy_actions
        Resource = aws_sns_topic.ses_alerts.arn
      },
      {
        Sid    = "CloudWatchAlarmPublish"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.ses_alerts.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:cloudwatch:${var.aws_region}:${var.aws_account_id}:alarm:friendminton-ses-*"
          }
          StringEquals = {
            "aws:SourceAccount" = var.aws_account_id
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = local.sns_topic_policy_actions
        Resource  = aws_sns_topic.ses_alerts.arn
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

  topic_arn = aws_sns_topic.ses_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "bounce_rate" {
  alarm_name          = "friendminton-ses-account-bounce-rate"
  alarm_description   = "SES account bounce rate is at or above AWS's recommended 5 percent warning threshold."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  metric_name         = "Reputation.BounceRate"
  namespace           = "AWS/SES"
  period              = 300
  statistic           = "Average"
  threshold           = 0.05
  treat_missing_data  = "ignore"
  alarm_actions       = [aws_sns_topic.ses_alerts.arn]
  ok_actions          = [aws_sns_topic.ses_alerts.arn]

  depends_on = [aws_sns_topic_policy.ses_alerts]
}

resource "aws_cloudwatch_metric_alarm" "complaint_rate" {
  alarm_name          = "friendminton-ses-account-complaint-rate"
  alarm_description   = "SES account complaint rate is at or above AWS's recommended 0.1 percent warning threshold."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  metric_name         = "Reputation.ComplaintRate"
  namespace           = "AWS/SES"
  period              = 300
  statistic           = "Average"
  threshold           = 0.001
  treat_missing_data  = "ignore"
  alarm_actions       = [aws_sns_topic.ses_alerts.arn]
  ok_actions          = [aws_sns_topic.ses_alerts.arn]

  depends_on = [aws_sns_topic_policy.ses_alerts]
}

resource "aws_cloudwatch_metric_alarm" "event_log_delivery" {
  for_each = local.environments

  alarm_name          = "friendminton-ses-${each.key}-event-log-delivery-failures"
  alarm_description   = "EventBridge failed to deliver ${each.key} SES events to CloudWatch Logs."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  metric_name         = "FailedInvocations"
  namespace           = "AWS/Events"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ses_alerts.arn]
  ok_actions          = [aws_sns_topic.ses_alerts.arn]

  dimensions = {
    EventBusName = "default"
    RuleName     = aws_cloudwatch_event_rule.ses_events[each.key].name
  }

  tags = {
    Environment = each.key
  }

  depends_on = [aws_sns_topic_policy.ses_alerts]
}
