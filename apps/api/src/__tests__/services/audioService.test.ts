import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock heavy dependencies before any module is imported
vi.mock("../../repositories/audioRepository.js", () => ({
  audioRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findByUser: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock("../../queue/audioQueue.js", () => ({
  AudioQueue: {
    enqueue: vi.fn(),
    startWorker: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("../../logging/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logMetric: vi.fn(),
}));

import { audioRepository } from "../../repositories/audioRepository.js";
import { AudioQueue } from "../../queue/audioQueue.js";
import { audioService } from "../../services/audioService.js";
import { AppError } from "../../middleware/errorHandler.js";
import type { AudioJob } from "../../repositories/audioRepository.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<AudioJob> = {}): AudioJob {
  return {
    id: "job-1",
    userId: "user-1",
    prompt: "rain on a tin roof",
    status: "queued",
    s3Key: null,
    durationMs: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── generate ──────────────────────────────────────────────────────────────────

describe("audioService.generate", () => {
  beforeEach(() => {
    vi.mocked(audioRepository.create).mockResolvedValue(makeJob());
    vi.mocked(AudioQueue.enqueue).mockResolvedValue({ id: "bull-1" } as never);
  });

  it("creates a repository record and enqueues the job", async () => {
    await audioService.generate({ userId: "user-1", prompt: "rain" });

    expect(audioRepository.create).toHaveBeenCalledOnce();
    expect(AudioQueue.enqueue).toHaveBeenCalledOnce();
  });

  it("returns the persisted job immediately (202 pattern)", async () => {
    const job = await audioService.generate({ userId: "user-1", prompt: "waves" });

    expect(job.status).toBe("queued");
    expect(job.userId).toBe("user-1");
  });

  it("uses 30 seconds as the default duration when durationSec is omitted", async () => {
    await audioService.generate({ userId: "user-1", prompt: "wind" });

    expect(AudioQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 30 })
    );
  });

  it("forwards the provided durationSec to the queue", async () => {
    await audioService.generate({ userId: "user-1", prompt: "wind", durationSec: 60 });

    expect(AudioQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSec: 60 })
    );
  });

  it("passes userId and prompt to both the repository and the queue", async () => {
    await audioService.generate({ userId: "user-99", prompt: "thunder clap", durationSec: 10 });

    expect(audioRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-99", prompt: "thunder clap" })
    );
    expect(AudioQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-99", prompt: "thunder clap" })
    );
  });

  it("creates the repository record before enqueuing (persist-first guarantee)", async () => {
    const order: string[] = [];

    vi.mocked(audioRepository.create).mockImplementation(async (data) => {
      order.push("create");
      return makeJob(data);
    });
    vi.mocked(AudioQueue.enqueue).mockImplementation(async () => {
      order.push("enqueue");
      return {} as never;
    });

    await audioService.generate({ userId: "u", prompt: "p" });
    expect(order).toEqual(["create", "enqueue"]);
  });

  it("uses the same job ID for both the record and the queue payload", async () => {
    let capturedCreateId = "";
    let capturedEnqueueId = "";

    vi.mocked(audioRepository.create).mockImplementation(async (data) => {
      capturedCreateId = data.id;
      return makeJob(data);
    });
    vi.mocked(AudioQueue.enqueue).mockImplementation(async (payload) => {
      capturedEnqueueId = payload.jobId;
      return {} as never;
    });

    await audioService.generate({ userId: "u", prompt: "p" });
    expect(capturedCreateId).toBe(capturedEnqueueId);
    expect(capturedCreateId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });
});

// ── getJob ────────────────────────────────────────────────────────────────────

describe("audioService.getJob", () => {
  it("returns the job when it belongs to the requesting user", async () => {
    vi.mocked(audioRepository.findById).mockResolvedValue(makeJob({ userId: "user-1" }));

    const job = await audioService.getJob("job-1", "user-1");
    expect(job.id).toBe("job-1");
  });

  it("throws a 404 AppError when the job does not exist", async () => {
    vi.mocked(audioRepository.findById).mockResolvedValue(null);

    await expect(audioService.getJob("ghost", "user-1")).rejects.toMatchObject({
      statusCode: 404,
      message: "Job not found",
    });
  });

  it("throws a 403 AppError when the job belongs to a different user", async () => {
    vi.mocked(audioRepository.findById).mockResolvedValue(
      makeJob({ userId: "other-user" })
    );

    await expect(audioService.getJob("job-1", "user-1")).rejects.toMatchObject({
      statusCode: 403,
      message: "Forbidden",
    });
  });

  it("404 and 403 errors are instances of AppError", async () => {
    vi.mocked(audioRepository.findById).mockResolvedValueOnce(null);
    await expect(audioService.getJob("x", "u")).rejects.toBeInstanceOf(AppError);

    vi.mocked(audioRepository.findById).mockResolvedValueOnce(makeJob({ userId: "other" }));
    await expect(audioService.getJob("x", "u")).rejects.toBeInstanceOf(AppError);
  });

  it("does not throw when userId matches exactly", async () => {
    vi.mocked(audioRepository.findById).mockResolvedValue(makeJob({ userId: "exact-match" }));
    await expect(audioService.getJob("job-1", "exact-match")).resolves.toBeDefined();
  });
});

// ── listJobs ──────────────────────────────────────────────────────────────────

describe("audioService.listJobs", () => {
  it("delegates to audioRepository.findByUser with the correct userId", async () => {
    vi.mocked(audioRepository.findByUser).mockResolvedValue([]);

    await audioService.listJobs("user-42");
    expect(audioRepository.findByUser).toHaveBeenCalledWith("user-42");
  });

  it("returns the array from the repository unchanged", async () => {
    const jobs = [makeJob(), makeJob({ id: "job-2" })];
    vi.mocked(audioRepository.findByUser).mockResolvedValue(jobs);

    const result = await audioService.listJobs("user-1");
    expect(result).toBe(jobs); // same reference
  });

  it("returns an empty array when the user has no jobs", async () => {
    vi.mocked(audioRepository.findByUser).mockResolvedValue([]);
    expect(await audioService.listJobs("nobody")).toEqual([]);
  });
});
