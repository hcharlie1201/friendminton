variable "deploy_public_key" {
  description = "Public half of the production-only GitHub Actions deploy key."
  type        = string
  sensitive   = true
}

variable "key_pair_name" {
  description = "Existing Lightsail key pair used for emergency SSH access."
  type        = string
  default     = "LightsailDefaultKeyPair"
}

variable "bucket_name" {
  description = "Globally unique production media bucket."
  type        = string
  default     = "friendminton-media-production"
}
