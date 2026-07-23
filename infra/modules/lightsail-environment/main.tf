resource "aws_lightsail_instance" "this" {
  name              = var.instance_name
  availability_zone = var.availability_zone
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = var.key_pair_name
  ip_address_type   = "dualstack"
  user_data         = var.user_data
  tags              = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_instance_public_ports" "this" {
  instance_name = aws_lightsail_instance.this.name

  port_info {
    protocol   = "tcp"
    from_port  = 22
    to_port    = 22
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  port_info {
    protocol   = "tcp"
    from_port  = 80
    to_port    = 80
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }

  port_info {
    protocol   = "tcp"
    from_port  = 443
    to_port    = 443
    cidrs      = ["0.0.0.0/0"]
    ipv6_cidrs = ["::/0"]
  }
}

resource "aws_lightsail_static_ip" "this" {
  name = var.static_ip_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_static_ip_attachment" "this" {
  static_ip_name = aws_lightsail_static_ip.this.name
  instance_name  = aws_lightsail_instance.this.name
}

resource "aws_lightsail_bucket" "this" {
  name         = var.bucket_name
  bundle_id    = var.bucket_bundle_id
  force_delete = false
  tags         = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_bucket_resource_access" "this" {
  bucket_name   = aws_lightsail_bucket.this.name
  resource_name = aws_lightsail_instance.this.name
}

# The AWS provider does not currently expose Lightsail instance metadata options or
# Lightsail bucket access/versioning settings. Keep those settings declarative and
# idempotent through the AWS CLI until first-class provider resources exist.
resource "terraform_data" "instance_metadata_options" {
  triggers_replace = [
    aws_lightsail_instance.this.id,
    "http-endpoint=enabled",
    "http-tokens=required",
    "http-put-response-hop-limit=2",
  ]

  provisioner "local-exec" {
    command = "aws lightsail update-instance-metadata-options --region '${aws_lightsail_instance.this.region}' --instance-name '${aws_lightsail_instance.this.name}' --http-endpoint enabled --http-tokens required --http-put-response-hop-limit 2"
  }
}

resource "terraform_data" "bucket_settings" {
  triggers_replace = [
    aws_lightsail_bucket.this.id,
    "versioning=Enabled",
    "getObject=private",
    "allowPublicOverrides=false",
  ]

  provisioner "local-exec" {
    command = "aws lightsail update-bucket --region '${aws_lightsail_bucket.this.region}' --bucket-name '${aws_lightsail_bucket.this.name}' --versioning Enabled --access-rules getObject=private,allowPublicOverrides=false"
  }
}
