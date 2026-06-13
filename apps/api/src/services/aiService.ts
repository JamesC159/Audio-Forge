import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ELEVENLABS_SOUND_GENERATION_URL =
  "https://api.elevenlabs.io/v1/sound-generation";

// ElevenLabs caps sound-effects at 22 seconds
const MAX_DURATION_SEC = 22;
const MIN_DURATION_SEC = 0.5;

export async function enhanceAudioPrompt(
  prompt: string,
  durationSec: number
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          `You are an expert audio engineer writing prompts for an AI sound-effects generator. ` +
          `Rewrite the following prompt to be vivid, specific, and technically descriptive — ` +
          `include texture, spatiality, dynamics, and timbral qualities. ` +
          `Target duration: ${durationSec} second(s). Keep the rewrite under 400 characters. ` +
          `Respond with ONLY the enhanced prompt text, nothing else.\n\nOriginal: ${prompt}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");
  return block.text.trim();
}

export async function generateAudio(
  prompt: string,
  durationSec: number
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const duration = Math.min(
    Math.max(durationSec, MIN_DURATION_SEC),
    MAX_DURATION_SEC
  );

  const response = await fetch(ELEVENLABS_SOUND_GENERATION_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: duration,
      prompt_influence: 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
