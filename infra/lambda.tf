data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "audio_processor" {
  name               = "${local.name_prefix}-audio-processor"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy" "audio_processor" {
  name = "audio-processor-policy"
  role = aws_iam_role.audio_processor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      # SQS read/delete
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.audio_jobs.arn
      },
      # S3 write to audio bucket
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.audio.arn}/audio/*"
      },
      # EMF metrics via CloudWatch
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
      }
    ]
  })
}

# Lambda function (placeholder zip — replace with real build artifact)
resource "aws_lambda_function" "audio_processor" {
  function_name = "${local.name_prefix}-audio-processor"
  role          = aws_iam_role.audio_processor.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = "${path.module}/../dist/lambda.zip"

  memory_size = var.lambda_memory_mb
  timeout     = var.lambda_timeout_sec

  environment {
    variables = {
      S3_AUDIO_BUCKET      = aws_s3_bucket.audio.bucket
      SQS_QUEUE_URL        = aws_sqs_queue.audio_jobs.url
      CLOUDWATCH_NAMESPACE = "AudioForge/${var.environment}"
      NODE_ENV             = var.environment
    }
  }

  # Structured CloudWatch logging
  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.audio_processor.name
  }
}

resource "aws_cloudwatch_log_group" "audio_processor" {
  name              = "/aws/lambda/${local.name_prefix}-audio-processor"
  retention_in_days = 30
}

# Wire SQS → Lambda
resource "aws_lambda_event_source_mapping" "sqs_to_lambda" {
  event_source_arn                   = aws_sqs_queue.audio_jobs.arn
  function_name                      = aws_lambda_function.audio_processor.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 5

  function_response_types = ["ReportBatchItemFailures"]
}

output "lambda_function_name" {
  value = aws_lambda_function.audio_processor.function_name
}

output "lambda_function_arn" {
  value = aws_lambda_function.audio_processor.arn
}
