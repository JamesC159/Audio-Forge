import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// vi.hoisted lets us share the mock fn between the factory and test bodies
const mockMessagesCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
  },
}));

import { enhanceAudioPrompt, generateAudio } from "../../services/aiService.js";

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
});

afterAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── enhanceAudioPrompt ────────────────────────────────────────────────────────

describe("enhanceAudioPrompt", () => {
  it("calls the Anthropic messages API and returns trimmed text", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "  Enhanced: rain on corrugated iron  " }],
    });

    const result = await enhanceAudioPrompt("rain", 5);
    expect(result).toBe("Enhanced: rain on corrugated iron");
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
  });

  it("includes the original prompt in the message sent to Claude", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Enhanced" }],
    });

    await enhanceAudioPrompt("thunder clap overhead", 10);

    const call = mockMessagesCreate.mock.calls[0][0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0].content).toContain("thunder clap overhead");
  });

  it("includes the target duration in the message sent to Claude", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Enhanced" }],
    });

    await enhanceAudioPrompt("fire crackle", 15);

    const call = mockMessagesCreate.mock.calls[0][0] as {
      messages: Array<{ content: string }>;
    };
    expect(call.messages[0].content).toContain("15");
  });

  it("throws when the response block type is not 'text'", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "tool_use", id: "abc", name: "fn", input: {} }],
    });

    await expect(enhanceAudioPrompt("rain", 5)).rejects.toThrow(
      "Unexpected Claude response type"
    );
  });

  it("propagates Anthropic API errors", async () => {
    mockMessagesCreate.mockRejectedValue(new Error("Anthropic 429: rate limit"));

    await expect(enhanceAudioPrompt("rain", 5)).rejects.toThrow("Anthropic 429");
  });
});

// ── generateAudio ─────────────────────────────────────────────────────────────

describe("generateAudio", () => {
  function stubFetch(opts: { ok: boolean; status?: number; body?: ArrayBuffer | string }) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: opts.ok,
      status: opts.status ?? 200,
      arrayBuffer: () => Promise.resolve(opts.body instanceof ArrayBuffer ? opts.body : new ArrayBuffer(0)),
      text: () => Promise.resolve(typeof opts.body === "string" ? opts.body : ""),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns a Buffer on a successful response", async () => {
    stubFetch({ ok: true });

    const result = await generateAudio("ocean waves", 5);
    expect(result).toBeInstanceOf(Buffer);
  });

  it("sends the prompt and api key to the ElevenLabs endpoint", async () => {
    const fetchMock = stubFetch({ ok: true });

    await generateAudio("crackling fire", 5);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
    expect(url).toContain("elevenlabs");
    expect(options.headers["xi-api-key"]).toBe("test-elevenlabs-key");
    expect(JSON.parse(options.body).text).toBe("crackling fire");
  });

  it("clamps duration above MAX_DURATION_SEC (22) down to 22", async () => {
    const fetchMock = stubFetch({ ok: true });

    await generateAudio("prompt", 300);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { duration_seconds: number };
    expect(body.duration_seconds).toBe(22);
  });

  it("clamps duration below MIN_DURATION_SEC (0.5) up to 0.5", async () => {
    const fetchMock = stubFetch({ ok: true });

    await generateAudio("prompt", 0);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { duration_seconds: number };
    expect(body.duration_seconds).toBe(0.5);
  });

  it("passes through durations within the valid range unchanged", async () => {
    const fetchMock = stubFetch({ ok: true });

    await generateAudio("prompt", 10);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { duration_seconds: number };
    expect(body.duration_seconds).toBe(10);
  });

  it("throws with status and body text when ElevenLabs returns a non-OK response", async () => {
    stubFetch({ ok: false, status: 422, body: "Unprocessable Entity" });

    await expect(generateAudio("prompt", 5)).rejects.toThrow(
      "ElevenLabs 422: Unprocessable Entity"
    );
  });

  it("throws when ELEVENLABS_API_KEY is not set", async () => {
    const saved = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;

    await expect(generateAudio("prompt", 5)).rejects.toThrow(
      "ELEVENLABS_API_KEY is not set"
    );

    process.env.ELEVENLABS_API_KEY = saved;
  });
});
