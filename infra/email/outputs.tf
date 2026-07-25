output "required_dns_records" {
  description = "Publish these records with the external DNS provider, preserving any unrelated existing TXT records."
  value = {
    for environment, identity in aws_sesv2_email_identity.sender :
    environment => concat(
      [
        for token in identity.dkim_signing_attributes[0].tokens : {
          name  = "${token}._domainkey.${identity.email_identity}"
          type  = "CNAME"
          value = "${token}.dkim.amazonses.com"
          ttl   = 300
        }
      ],
      [
        {
          name  = local.environments[environment].mail_from_domain
          type  = "MX"
          value = "10 feedback-smtp.${var.aws_region}.amazonses.com"
          ttl   = 300
        },
        {
          name  = local.environments[environment].mail_from_domain
          type  = "TXT"
          value = "v=spf1 include:amazonses.com ~all"
          ttl   = 300
        },
        {
          name  = "_dmarc.${identity.email_identity}"
          type  = "TXT"
          value = "v=DMARC1; p=none; adkim=r; aspf=r; pct=100"
          ttl   = 300
        },
      ]
    )
  }
}

output "runtime_email_configuration" {
  description = "Non-secret server environment values and the IAM user whose access key must be created outside Terraform."
  value = {
    for environment, settings in local.environments :
    environment => {
      EMAIL_PROVIDER        = "ses"
      SES_REGION            = var.aws_region
      SES_FROM_NAME         = "Friendminton"
      SES_FROM_ADDRESS      = settings.from_address
      SES_CONFIGURATION_SET = settings.configuration_set_name
      IAM_USER_NAME         = aws_iam_user.ses_sender[environment].name
    }
  }
}

output "event_log_groups" {
  description = "CloudWatch log groups containing SES delivery metadata for each environment."
  value = {
    for environment, log_group in aws_cloudwatch_log_group.ses_events :
    environment => log_group.name
  }
}

output "alert_topic_arn" {
  description = "SNS topic used by SES reputation and event-pipeline alarms."
  value       = aws_sns_topic.ses_alerts.arn
}
