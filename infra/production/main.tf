provider "aws" {
  region              = "us-west-2"
  allowed_account_ids = ["973118666773"]
}

module "environment" {
  source = "../modules/lightsail-environment"

  environment       = "production"
  instance_name     = "friendminton-production"
  availability_zone = "us-west-2a"
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "micro_3_0"
  key_pair_name     = var.key_pair_name
  static_ip_name    = "friendminton-production-ip"
  bucket_name       = var.bucket_name
  bucket_bundle_id  = "small_1_0"
  user_data = templatefile("${path.module}/cloud-init.sh.tftpl", {
    deploy_public_key_base64 = base64encode(var.deploy_public_key)
  })

  tags = {
    Project     = "friendminton"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
