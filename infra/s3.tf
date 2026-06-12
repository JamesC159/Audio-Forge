# ── Audio output bucket ───────────────────────────────────────────────────────

resource "aws_s3_bucket" "audio" {
  bucket = "${local.name_prefix}-audio"
}

resource "aws_s3_bucket_versioning" "audio" {
  bucket = aws_s3_bucket.audio.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["http://localhost:5173"]
    max_age_seconds = 3600
  }
}

# Block all public access — audio served via presigned URLs only
resource "aws_s3_bucket_public_access_block" "audio" {
  bucket                  = aws_s3_bucket.audio.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: move completed audio to cheaper storage after 90 days
resource "aws_s3_bucket_lifecycle_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    id     = "archive-old-audio"
    status = "Enabled"

    filter { prefix = "audio/" }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}

output "audio_bucket_name" {
  value = aws_s3_bucket.audio.bucket
}

output "audio_bucket_arn" {
  value = aws_s3_bucket.audio.arn
}
