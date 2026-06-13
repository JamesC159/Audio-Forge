import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/audioService.js", () => ({
  audioService: {
    generate: vi.fn(),
    getJob: vi.fn(),
    listJobs: vi.fn(),
  },
}));

import type { Request, Response, NextFunction } from "express";
import { audioController } from "../../controllers/audioController.js";
import { audioService } from "../../services/audioService.js";
import { AppError } from "../../middleware/errorHandler.js";
import type { AudioJob } from "../../repositories/audioRepository.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<AudioJob> = {}): AudioJob {
  return {
    id: "job-1",
    userId: "user-1",
    prompt: "ocean waves at dawn",
    status: "queued",
    s3Key: null,
    durationMs: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    user: { sub: "user-1", email: "test@example.com", plan: "pro", iat: 0, exp: 9_999_999_999 },
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status, json } as unknown as Response, status, json };
}

// ── generate ──────────────────────────────────────────────────────────────────

describe("audioController.generate", () => {
  beforeEach(() => {
    vi.mocked(audioService.generate).mockResolvedValue(makeJob());
  });

  it("returns 202 with the created job on a valid request", async () => {
    const req = makeReq({ body: { prompt: "rain on a tin roof", durationSec: 10 } });
    const { res, status, json } = makeRes();

    await audioController.generate(req, res, vi.fn() as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }));
  });

  it("calls audioService.generate with userId from req.user and validated body", async () => {
    const req = makeReq({ body: { prompt: "thunder", durationSec: 20 } });

    await audioController.generate(req, makeRes().res, vi.fn() as unknown as NextFunction);

    expect(audioService.generate).toHaveBeenCalledWith({
      userId: "user-1",
      prompt: "thunder",
      durationSec: 20,
    });
  });

  it("omits durationSec when not provided in the body", async () => {
    const req = makeReq({ body: { prompt: "wind through trees" } });

    await audioController.generate(req, makeRes().res, vi.fn() as unknown as NextFunction);

    expect(audioService.generate).toHaveBeenCalledWith({
      userId: "user-1",
      prompt: "wind through trees",
      durationSec: undefined,
    });
  });

  it("calls next() with ZodError when prompt is too short (< 3 chars)", async () => {
    const req = makeReq({ body: { prompt: "ab" } });
    const next = vi.fn();

    await audioController.generate(req, makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeDefined();
    expect(audioService.generate).not.toHaveBeenCalled();
  });

  it("calls next() with ZodError when prompt is too long (> 500 chars)", async () => {
    const req = makeReq({ body: { prompt: "x".repeat(501) } });
    const next = vi.fn();

    await audioController.generate(req, makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(audioService.generate).not.toHaveBeenCalled();
  });

  it("calls next() with ZodError when durationSec is below min (5)", async () => {
    const req = makeReq({ body: { prompt: "valid prompt here", durationSec: 4 } });
    const next = vi.fn();

    await audioController.generate(req, makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() with ZodError when durationSec is above max (300)", async () => {
    const req = makeReq({ body: { prompt: "valid prompt here", durationSec: 301 } });
    const next = vi.fn();

    await audioController.generate(req, makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() with ZodError when durationSec is a float", async () => {
    const req = makeReq({ body: { prompt: "valid prompt", durationSec: 5.5 } });
    const next = vi.fn();

    await audioController.generate(req, makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() with service errors (does not swallow them)", async () => {
    const serviceError = new AppError(500, "Queue unavailable");
    vi.mocked(audioService.generate).mockRejectedValue(serviceError);

    const req = makeReq({ body: { prompt: "valid prompt" } });
    const next = vi.fn();

    await audioController.generate(req, makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(serviceError);
  });
});

// ── getJob ────────────────────────────────────────────────────────────────────

describe("audioController.getJob", () => {
  it("returns the job as JSON when found", async () => {
    const job = makeJob({ id: "job-abc" });
    vi.mocked(audioService.getJob).mockResolvedValue(job);

    const req = makeReq({ params: { id: "job-abc" } });
    const { res, json } = makeRes();

    await audioController.getJob(req, res, vi.fn() as unknown as NextFunction);

    expect(json).toHaveBeenCalledWith(job);
  });

  it("passes the job id and userId from req.user to audioService.getJob", async () => {
    vi.mocked(audioService.getJob).mockResolvedValue(makeJob());

    const req = makeReq({ params: { id: "job-xyz" } });

    await audioController.getJob(req, makeRes().res, vi.fn() as unknown as NextFunction);

    expect(audioService.getJob).toHaveBeenCalledWith("job-xyz", "user-1");
  });

  it("calls next() with a 404 AppError when the job is not found", async () => {
    const error = new AppError(404, "Job not found");
    vi.mocked(audioService.getJob).mockRejectedValue(error);

    const next = vi.fn();
    await audioController.getJob(
      makeReq({ params: { id: "ghost" } }),
      makeRes().res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(error);
  });

  it("calls next() with a 403 AppError when the job belongs to another user", async () => {
    const error = new AppError(403, "Forbidden");
    vi.mocked(audioService.getJob).mockRejectedValue(error);

    const next = vi.fn();
    await audioController.getJob(
      makeReq({ params: { id: "job-1" } }),
      makeRes().res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(error);
  });
});

// ── listJobs ──────────────────────────────────────────────────────────────────

describe("audioController.listJobs", () => {
  it("returns jobs array with count", async () => {
    const jobs = [makeJob(), makeJob({ id: "job-2" })];
    vi.mocked(audioService.listJobs).mockResolvedValue(jobs);

    const { res, json } = makeRes();
    await audioController.listJobs(makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(json).toHaveBeenCalledWith({ jobs, count: 2 });
  });

  it("returns empty jobs array with count 0 when user has no jobs", async () => {
    vi.mocked(audioService.listJobs).mockResolvedValue([]);

    const { res, json } = makeRes();
    await audioController.listJobs(makeReq(), res, vi.fn() as unknown as NextFunction);

    expect(json).toHaveBeenCalledWith({ jobs: [], count: 0 });
  });

  it("passes the userId from req.user to audioService.listJobs", async () => {
    vi.mocked(audioService.listJobs).mockResolvedValue([]);

    await audioController.listJobs(makeReq(), makeRes().res, vi.fn() as unknown as NextFunction);

    expect(audioService.listJobs).toHaveBeenCalledWith("user-1");
  });

  it("calls next() with service errors", async () => {
    const error = new Error("Database unavailable");
    vi.mocked(audioService.listJobs).mockRejectedValue(error);

    const next = vi.fn();
    await audioController.listJobs(makeReq(), makeRes().res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(error);
  });
});
