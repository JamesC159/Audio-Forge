import { describe, it, expect } from "vitest";
import { audioRepository } from "../../repositories/audioRepository.js";

// The repository uses a module-level Map, so tests share state.
// Each test uses unique IDs/userIds to stay independent.

describe("audioRepository.create", () => {
  it("returns a job with queued status and null optional fields", async () => {
    const job = await audioRepository.create({
      id: "create-1",
      userId: "user-create",
      prompt: "ocean waves",
    });

    expect(job).toMatchObject({
      id: "create-1",
      userId: "user-create",
      prompt: "ocean waves",
      status: "queued",
      s3Key: null,
      durationMs: null,
      errorMessage: null,
    });
    expect(job.createdAt).toBeInstanceOf(Date);
    expect(job.updatedAt).toBeInstanceOf(Date);
  });

  it("persists the job so it can be retrieved by id", async () => {
    await audioRepository.create({ id: "create-2", userId: "u", prompt: "rain" });
    const found = await audioRepository.findById("create-2");
    expect(found?.id).toBe("create-2");
  });
});

describe("audioRepository.findById", () => {
  it("returns the job when it exists", async () => {
    await audioRepository.create({ id: "find-1", userId: "u", prompt: "thunder" });
    const job = await audioRepository.findById("find-1");
    expect(job?.id).toBe("find-1");
    expect(job?.prompt).toBe("thunder");
  });

  it("returns null when the job does not exist", async () => {
    const job = await audioRepository.findById("nonexistent-xyz");
    expect(job).toBeNull();
  });
});

describe("audioRepository.findByUser", () => {
  it("returns only jobs that belong to the specified user", async () => {
    const userId = `user-filter-${Math.random()}`;

    await audioRepository.create({ id: `fb-1-${userId}`, userId, prompt: "a" });
    await audioRepository.create({ id: `fb-2-${userId}`, userId, prompt: "b" });
    await audioRepository.create({ id: `fb-3-${userId}`, userId: "other-user", prompt: "c" });

    const jobs = await audioRepository.findByUser(userId);

    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.userId === userId)).toBe(true);
  });

  it("returns jobs sorted by createdAt descending (newest first)", async () => {
    const userId = `user-sort-${Math.random()}`;

    await audioRepository.create({ id: `sort-1-${userId}`, userId, prompt: "first" });
    await new Promise((r) => setTimeout(r, 5));
    await audioRepository.create({ id: `sort-2-${userId}`, userId, prompt: "second" });
    await new Promise((r) => setTimeout(r, 5));
    await audioRepository.create({ id: `sort-3-${userId}`, userId, prompt: "third" });

    const jobs = await audioRepository.findByUser(userId);

    expect(jobs[0].prompt).toBe("third");
    expect(jobs[1].prompt).toBe("second");
    expect(jobs[2].prompt).toBe("first");
  });

  it("returns an empty array when the user has no jobs", async () => {
    const jobs = await audioRepository.findByUser("user-with-no-jobs");
    expect(jobs).toEqual([]);
  });
});

describe("audioRepository.updateStatus", () => {
  it("updates specified fields and returns the updated job", async () => {
    await audioRepository.create({ id: "up-1", userId: "u", prompt: "wind" });

    const updated = await audioRepository.updateStatus("up-1", {
      status: "completed",
      s3Key: "audio/u/up-1.mp3",
      durationMs: 4200,
    });

    expect(updated).toMatchObject({
      id: "up-1",
      status: "completed",
      s3Key: "audio/u/up-1.mp3",
      durationMs: 4200,
      errorMessage: null,
    });
  });

  it("updates the updatedAt timestamp", async () => {
    await audioRepository.create({ id: "up-2", userId: "u", prompt: "fire" });
    const before = (await audioRepository.findById("up-2"))!.updatedAt.getTime();

    await new Promise((r) => setTimeout(r, 5));
    const updated = await audioRepository.updateStatus("up-2", { status: "processing" });

    expect(updated!.updatedAt.getTime()).toBeGreaterThan(before);
  });

  it("preserves fields not included in the patch", async () => {
    await audioRepository.create({ id: "up-3", userId: "user-preserve", prompt: "keep this" });
    await audioRepository.updateStatus("up-3", { status: "processing" });

    const job = await audioRepository.findById("up-3");
    expect(job?.prompt).toBe("keep this");
    expect(job?.userId).toBe("user-preserve");
  });

  it("stores an errorMessage when provided", async () => {
    await audioRepository.create({ id: "up-4", userId: "u", prompt: "p" });

    const updated = await audioRepository.updateStatus("up-4", {
      status: "failed",
      errorMessage: "ElevenLabs 429: rate limit",
    });

    expect(updated?.errorMessage).toBe("ElevenLabs 429: rate limit");
    expect(updated?.status).toBe("failed");
  });

  it("returns null when the job does not exist", async () => {
    const result = await audioRepository.updateStatus("ghost-id", { status: "failed" });
    expect(result).toBeNull();
  });
});
