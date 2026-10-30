variable "aws_region" {
  type = string
  default = "us-east-1"
}
variable "name" {
  type = string
  default = "agentic-shortener"
}
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "app_kind" {
  type = string
  description = "node or spring"
  validation {
    condition = contains(["node", "spring"], var.app_kind)
    error_message = "app_kind must be node or spring"
  }
}
variable "image_uri" {
  type = string
  description = "Full ECR image URI with tag"
}
variable "certificate_arn" {
  type = string
  description = "Issued ACM certificate for api_domain in the same region"
}
variable "api_domain" {
  type = string
  description = "HTTPS DNS host for API and shortened links"
}
variable "route53_zone_id" {
  type = string
  default = ""
}
variable "cors_origins" {
  type = string
  description = "Comma-separated exact frontend origins"
}
variable "cognito_user_pool_id" { type = string }
variable "cognito_client_id" { type = string }
variable "visitor_secret_arn" {
  type = string
  description = "Secrets Manager ARN containing HMAC secret plaintext"
}
variable "multi_az" {
  type = bool
  default = false
}
