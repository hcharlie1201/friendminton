import {
  to = module.environment.aws_lightsail_instance.this
  id = "friendminton"
}

import {
  to = module.environment.aws_lightsail_static_ip.this
  id = "friendminton-ip"
}

import {
  to = module.environment.aws_lightsail_static_ip_attachment.this
  id = "friendminton-ip"
}

import {
  to = module.environment.aws_lightsail_bucket.this
  id = "friendminton-media-us-west-2"
}

import {
  to = module.environment.aws_lightsail_bucket_resource_access.this
  id = "friendminton-media-us-west-2,friendminton"
}
