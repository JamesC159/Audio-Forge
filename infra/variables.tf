variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev | staging | prod)"
  type        = string
  default     = "dev"
}

variable "project" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "audio-forge"
}

variable "lambda_memory_mb" {
  description = "Memory for the audio processor Lambda (MB)"
  type        = number
  default     = 512
}

variable "lambda_timeout_sec" {
  description = "Max Lambda execution time in seconds"
  type        = number
  default     = 300
}

variable "sqs_visibility_timeout_sec" {
  description = "How long a message stays invisible after dequeue"
  type        = number
  default     = 360  # Must be > lambda_timeout to avoid duplicate processing
}

locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
