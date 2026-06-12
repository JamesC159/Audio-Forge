import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { SQSEvent, SQSBatchResponse } from "aws-lambda";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const BUCKET = process.env.S3_AUDIO_BUCKET ?? "audio-forge-audio-dev";

interface AudioJobPayload {
  jobId: string;
  userId: string;
  prompt: string;
  durationSec: number;
}

async function processRecord(payload: AudioJobPayload): Promise<void> {
  const { jobId, userId, prompt, durationSec } = payload;
  const s3Key = `audio/${userId}/${jobId}.mp3`;

  // Replace with real audio generation (e.g. Suno, ElevenLabs)
  const audioBuffer = Buffer.from(`AUDIO:${prompt}:${durationSec}s`);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: audioBuffer,
    ContentType: "audio/mpeg",
    Metadata: { jobId, userId },
  }));

  console.log(JSON.stringify({ level: "info", jobId, s3Key, msg: "Audio uploaded" }));
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse["batchItemFailures"] = [];

  await Promise.all(event.Records.map(async (record) => {
    let jobId = record.messageId;
    try {
      const payload = JSON.parse(record.body) as AudioJobPayload;
      jobId = payload.jobId;
      await processRecord(payload);
    } catch (err) {
      console.error(JSON.stringify({ level: "error", jobId, err: String(err), msg: "Record failed" }));
      // Return failed message IDs so Lambda+SQS retries only the bad records
      failures.push({ itemIdentifier: record.messageId });
    }
  }));

  return { batchItemFailures: failures };
}
