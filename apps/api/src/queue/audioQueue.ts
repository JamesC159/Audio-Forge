import { Queue, Worker, type Job } from "bullmq";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { logger, logMetric } from "../logging/logger.js";
import { audioRepository } from "../repositories/audioRepository.js";
import { CircuitBreaker } from "./circuitBreaker.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudioJobPayload {
  jobId: string;
  userId: string;
  prompt: string;
  durationSec: number;
}

// ── SQS client (prod only — skipped when SQS_QUEUE_URL is absent) ────────────

const sqs = process.env.SQS_QUEUE_URL
  ? new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" })
  : null;

// ── Shared Redis connection ────────────────────────────────────────────────────

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || "6379"),
  maxRetriesPerRequest: null, // Required by BullMQ
};

// ── S3 client + circuit breaker ───────────────────────────────────────────────

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

const s3CircuitBreaker = new CircuitBreaker(
  async (key: unknown, body: unknown) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_AUDIO_BUCKET ?? "audio-forge-audio-dev",
        Key: key as string,
        Body: body as Buffer,
        ContentType: "audio/mpeg",
      })
    );
  },
  {
    name: "s3-upload",
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 30000, // 30 s before retrying
  }
);

// ── Queue ─────────────────────────────────────────────────────────────────────

const QUEUE_NAME = "audio-generation";

const queue = new Queue<AudioJobPayload, void, string>(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// ── Worker ────────────────────────────────────────────────────────────────────

async function processAudioJob(job: Job<AudioJobPayload>) {
  const { jobId, userId, prompt, durationSec } = job.data;
  const start = Date.now();

  logger.info({ jobId, userId }, "Processing audio generation job");
  await audioRepository.updateStatus(jobId, { status: "processing" });

  try {
    // ── REPLACE with real AI audio generation call ──────────────────────────
    // e.g. await suno.generate({ prompt, durationSec })
    // Simulated latency for demo:
    await job.updateProgress(10);
    await new Promise((r) => setTimeout(r, 1000));
    await job.updateProgress(60);
    await new Promise((r) => setTimeout(r, 500));
    await job.updateProgress(90);

    const fakeAudioBuffer = Buffer.from(`AUDIO:${prompt}:${durationSec}s`);
    const s3Key = `audio/${userId}/${jobId}.mp3`;

    // Upload through circuit breaker — fast-fails if S3 is degraded
    await s3CircuitBreaker.call(s3Key, fakeAudioBuffer);

    await audioRepository.updateStatus(jobId, {
      status: "completed",
      s3Key,
      durationMs: Date.now() - start,
    });

    const elapsed = Date.now() - start;
    logMetric("AudioJobDuration", elapsed, "Milliseconds", { userId });
    logMetric("AudioJobCompleted", 1, "Count", { userId });

    logger.info({ jobId, elapsed }, "Audio generation completed");
    await job.updateProgress(100);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await audioRepository.updateStatus(jobId, {
      status: "failed",
      errorMessage,
    });
    logMetric("AudioJobFailed", 1, "Count", { userId });
    logger.error({ jobId, err }, "Audio generation failed");
    throw err; // re-throw so BullMQ retries
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const AudioQueue = {
  async enqueue(payload: AudioJobPayload) {
    const job = await queue.add("generate", payload, {
      jobId: payload.jobId,
    });

    if (sqs && process.env.SQS_QUEUE_URL) {
      sqs.send(new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(payload),
      })).catch((err) => {
        logger.warn({ jobId: payload.jobId, err }, "SQS enqueue failed — BullMQ will handle locally");
      });
    }

    logger.info({ jobId: payload.jobId, bullJobId: job.id }, "Job enqueued");
    return job;
  },

  startWorker() {
    const worker = new Worker<AudioJobPayload, void, string>(QUEUE_NAME, processAudioJob, {
      connection,
      concurrency: 5, // tune to match ML GPU capacity
    });

    worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.data.jobId, err }, "Worker job failed permanently");
    });

    logger.info("Audio queue worker started");
    return worker;
  },

  async close() {
    await queue.close();
  },
};
