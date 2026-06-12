// Repository layer — all SQL lives here. Swap the driver; controllers stay untouched.
// Using a lightweight query builder pattern (no ORM) for transparency.

export interface AudioJob {
  id: string;
  userId: string;
  prompt: string;
  status: "queued" | "processing" | "completed" | "failed";
  s3Key: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In production this wraps a pg Pool or Prisma client.
// Kept as an in-memory store here so the demo runs without Postgres.
const store = new Map<string, AudioJob>();

export const audioRepository = {
  async create(data: Pick<AudioJob, "id" | "userId" | "prompt">): Promise<AudioJob> {
    const job: AudioJob = {
      ...data,
      status: "queued",
      s3Key: null,
      durationMs: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.set(job.id, job);
    return job;
  },

  async findById(id: string): Promise<AudioJob | null> {
    return store.get(id) ?? null;
  },

  async findByUser(userId: string): Promise<AudioJob[]> {
    return [...store.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async updateStatus(
    id: string,
    patch: Partial<Pick<AudioJob, "status" | "s3Key" | "durationMs" | "errorMessage">>
  ): Promise<AudioJob | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    store.set(id, updated);
    return updated;
  },
};
