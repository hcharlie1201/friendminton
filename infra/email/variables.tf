variable "aws_region" {
  description = "AWS Region where Friendminton sends email."
  type        = string
  default     = "us-west-2"
}

variable "aws_account_id" {
  description = "AWS account that owns the Friendminton SES resources."
  type        = string
  default     = "973118666773"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "root_domain" {
  description = "Production sending domain. DNS is managed outside this stack."
  type        = string
  default     = "friendminton.com"
}

variable "staging_domain" {
  description = "Staging sending subdomain. DNS is managed outside this stack."
  type        = string
  default     = "staging.friendminton.com"
}

variable "alert_email" {
  description = "Optional operator address for SES alarm notifications. The SNS subscription must be confirmed manually."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.alert_email == null ||
      can(regex("^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$", var.alert_email))
    )
    error_message = "alert_email must be null or a valid-looking email address."
  }
}
