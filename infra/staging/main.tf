provider "aws" {
  region              = "us-west-2"
  allowed_account_ids = ["973118666773"]
}

module "environment" {
  source = "../modules/lightsail-environment"

  environment       = "staging"
  instance_name     = "friendminton"
  availability_zone = "us-west-2a"
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "micro_3_0"
  key_pair_name     = "LightsailDefaultKeyPair"
  static_ip_name    = "friendminton-ip"
  bucket_name       = "friendminton-media-us-west-2"
  bucket_bundle_id  = "small_1_0"
}
