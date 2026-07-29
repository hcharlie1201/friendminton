output "public_ip" {
  value = module.environment.public_ip
}

output "bucket_name" {
  value = module.environment.bucket_name
}

output "alerts_topic_arn" {
  description = "SNS topic used by staging Lightsail CloudWatch alarms."
  value       = aws_sns_topic.staging_alerts.arn
}
