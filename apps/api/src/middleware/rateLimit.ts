import rateLimit from "express-rate-limit";
import type { Plan } from "./auth.js";

// Plan-aware rate limits — free users get throttled hard, enterprise has headroom
const LIMITS: Record<Plan, { windowMs: number; max: number }> = {
  free:       { windowMs: 60_000, max: 5  },   // 5 req / min
  pro:        { windowMs: 60_000, max: 60  },  // 60 req / min
  enterprise: { windowMs: 60_000, max: 600 },  // 600 req / min
};

/**
 * Dynamic rate limiter — reads `req.user.plan` (set by requireAuth) to pick
 * the right window. Falls back to free limits for unauthenticated requests.
 */
export const planRateLimit = rateLimit({
  windowMs: 60_000,
  // Per-request maximum — returns the limit for this user's plan
  limit: (req) => {
    const plan = (req.user?.plan as Plan | undefined) ?? "free";
    return LIMITS[plan].max;
  },
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anon",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Rate limit exceeded. Upgrade your plan for higher limits." },
});

// Stricter limit for expensive audio-generation endpoints
export const generationRateLimit = rateLimit({
  windowMs: 60_000,
  limit: (req) => {
    const plan = (req.user?.plan as Plan | undefined) ?? "free";
    // Generation costs more — tighten by 6×
    return Math.max(1, Math.floor(LIMITS[plan].max / 6));
  },
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? "anon",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Generation rate limit exceeded." },
});
