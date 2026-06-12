import { randomUUID } from "crypto";
import { audioRepository, type AudioJob } from "../repositories/audioRepository.js";
import { AudioQueue } from "../queue/audioQueue.js";
import { AppError } from "../middleware/errorHandler.js";
import { logMetric } from "../logging/logger.js";

export interface GenerateRequest {
  userId: string;
  prompt: string;
  durationSec?: number;
}

export const audioService = {
  /**
   * Persists a job record then enqueues it — caller gets the ID immediately
   * so the UI can poll for status without blocking on generation.
   */
  async generate(req: GenerateRequest): Promise<AudioJob> {
    const id = randomUUID();

    // 1. Persist first — if the queue enqueue fails we still have the record
    const job = await audioRepository.create({
      id,
      userId: req.userId,
      prompt: req.prompt,
    });

    // 2. Enqueue async work
    await AudioQueue.enqueue({
      jobId: id,
      userId: req.userId,
      prompt: req.prompt,
      durationSec: req.durationSec ?? 30,
    });

    logMetric("AudioJobQueued", 1, "Count", { userId: req.userId });
    return job;
  },

  async getJob(id: string, userId: string): Promise<AudioJob> {
    const job = await audioRepository.findById(id);
    if (!job) throw new AppError(404, "Job not found");
    // Users can only see their own jobs
    if (job.userId !== userId) throw new AppError(403, "Forbidden");
    return job;
  },

  async listJobs(userId: string): Promise<AudioJob[]> {
    return audioRepository.findByUser(userId);
  },
};
