variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "instance_name" {
  description = "Lightsail instance name."
  type        = string
}

variable "availability_zone" {
  description = "Availability zone for the instance."
  type        = string
}

variable "blueprint_id" {
  description = "Lightsail operating-system blueprint."
  type        = string
  default     = "ubuntu_24_04"
}

variable "bundle_id" {
  description = "Lightsail instance bundle."
  type        = string
  default     = "micro_3_0"
}

variable "key_pair_name" {
  description = "Existing Lightsail key pair used for emergency SSH access."
  type        = string
}

variable "static_ip_name" {
  description = "Lightsail static IP allocation name."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique Lightsail object-storage bucket name."
  type        = string
}

variable "bucket_bundle_id" {
  description = "Lightsail object-storage bundle."
  type        = string
  default     = "small_1_0"
}

variable "user_data" {
  description = "Cloud-init bootstrap for newly created instances. Keep null for imported instances."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to taggable Lightsail resources."
  type        = map(string)
  default     = {}
}
