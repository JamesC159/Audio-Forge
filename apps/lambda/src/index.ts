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

async function enhancePrompt(prompt: string, durationSec: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return prompt; // fall back to original if key missing

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content:
          `You are an expert audio engineer writing prompts for an AI sound-effects generator. ` +
          `Rewrite the following prompt to be vivid, specific, and technically descriptive — ` +
          `include texture, spatiality, dynamics, and timbral qualities. ` +
          `Target duration: ${durationSec} second(s). Keep the rewrite under 400 characters. ` +
          `Respond with ONLY the enhanced prompt text, nothing else.\n\nOriginal: ${prompt}`,
      }],
    }),
  });

  if (!res.ok) return prompt;
  const json = await res.json() as { content: Array<{ type: string; text: string }> };
  return json.content[0]?.text?.trim() ?? prompt;
}

async function generateAudio(prompt: string, durationSec: number): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const duration = Math.min(Math.max(durationSec, 0.5), 22);

  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: prompt, duration_seconds: duration, prompt_influence: 0.3 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function processRecord(payload: AudioJobPayload): Promise<void> {
  const { jobId, userId, prompt, durationSec } = payload;
  const s3Key = `audio/${userId}/${jobId}.mp3`;

  const enhancedPrompt = await enhancePrompt(prompt, durationSec);
  console.log(JSON.stringify({ level: "info", jobId, enhancedPrompt, msg: "Prompt enhanced" }));

  const audioBuffer = await generateAudio(enhancedPrompt, durationSec);

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
