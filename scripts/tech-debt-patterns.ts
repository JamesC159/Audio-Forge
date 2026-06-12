/**
 * Tech debt annotation patterns.
 *
 * Interview context: when asked "tell me about a time you shipped something
 * you weren't fully happy with", these comments are the artifact.
 *
 * The pattern: make the debt explicit, time-boxed, and traceable — so the
 * next engineer knows what was intentional vs what's just broken.
 */

// ── Pattern 1: TODO with ticket + expiry date ──────────────────────────────────
// Shows you know the debt, have a plan, and aren't hiding it in git history.

function getAudioDuration(s3Key: string): Promise<number> {
  // TODO(AF-1142, expires: 2025-Q3): returns file size as a proxy for duration.
  // Real impl requires ffprobe on the Lambda layer which adds 45 MB to cold start.
  // Acceptable for MVP — P95 duration estimate error is < 8%.
  // After ticket resolves: stream header parse instead.
  return Promise.resolve(0);
}

// ── Pattern 2: FIXME with known failure mode documented ───────────────────────

function parsePrompt(raw: string): string {
  // FIXME(AF-891): strip() removes leading/trailing whitespace but doesn't
  // normalise internal unicode spaces (U+00A0, U+2009). Saw one production
  // prompt fail the 500-char limit check because of a non-breaking space.
  // Quick fix ships now; proper normalisation in next sprint.
  return raw.trim();
}

// ── Pattern 3: HACK with explicit rollback instructions ───────────────────────

async function enqueueWithRetry(payload: unknown, attempts = 3): Promise<void> {
  // HACK: exponential backoff is hand-rolled here because the BullMQ version
  // pinned in package.json (5.0.0) has a bug in custom backoff strategies
  // (see bullmq/issues/2317). Bump to 5.2.0 when QA signs off and delete this.
  // Rollback: set attempts to 1 and let BullMQ's native retry handle it.
  for (let i = 0; i < attempts; i++) {
    try {
      // await queue.add(payload);  // actual call
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 2 ** i * 500));
    }
  }
}

// ── Pattern 4: Debt ledger comment on a whole module ─────────────────────────

/**
 * @module audioRepository
 *
 * KNOWN DEBT (added 2024-11-01, owner: @jcombs):
 *   1. No connection pooling — each Lambda invocation opens a new pg connection.
 *      Impact: cold starts add ~200 ms. Fix: RDS Proxy (ticket AF-1034).
 *   2. findByUser does a full table scan on large accounts (>500 jobs).
 *      Impact: P99 > 2 s for power users. Fix: add (user_id, created_at DESC) index.
 *      Acceptable until we hit 10 k active users (estimated Q2 2025).
 *   3. updateStatus is not atomic — race condition if two workers process same job.
 *      Impact: rare duplicate completion event, harmless today (idempotent S3 write).
 *      Fix: SELECT FOR UPDATE or optimistic locking before GA.
 *
 * Intentional non-debt (do NOT "fix"):
 *   - In-memory store in test/dev mode — deliberately simple, no Docker needed.
 */

export {};
