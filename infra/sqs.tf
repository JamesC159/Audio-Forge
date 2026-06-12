# ── Dead-letter queue ─────────────────────────────────────────────────────────

resource "aws_sqs_queue" "audio_dlq" {
  name                       = "${local.name_prefix}-audio-jobs-dlq"
  message_retention_seconds  = 1209600 # 14 days
  receive_wait_time_seconds  = 20      # Long polling

  tags = local.common_tags
}

# ── Main job queue ────────────────────────────────────────────────────────────

resource "aws_sqs_queue" "audio_jobs" {
  name                       = "${local.name_prefix}-audio-jobs"
  visibility_timeout_seconds = var.sqs_visibility_timeout_sec
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20    # Long polling — reduces empty receives

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.audio_dlq.arn
    maxReceiveCount     = 3  # Move to DLQ after 3 failed attempts
  })

  tags = local.common_tags
}

# Allow Lambda to receive from the queue
resource "aws_sqs_queue_policy" "audio_jobs" {
  queue_url = aws_sqs_queue.audio_jobs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      Resource  = aws_sqs_queue.audio_jobs.arn
    }]
  })
}

output "sqs_queue_url" {
  value = aws_sqs_queue.audio_jobs.url
}

output "sqs_dlq_url" {
  value = aws_sqs_queue.audio_dlq.url
}