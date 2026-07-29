variable "alert_email" {
  description = "Optional operator address for Lightsail staging alarm notifications. The SNS subscription must be confirmed manually."
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
