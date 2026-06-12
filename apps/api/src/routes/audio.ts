import { Router } from "express";
import { audioController } from "../controllers/audioController.js";
import { requireAuth, requirePlan } from "../middleware/auth.js";
import { planRateLimit, generationRateLimit } from "../middleware/rateLimit.js";

export const audioRouter = Router();

// All audio routes require authentication
audioRouter.use(requireAuth);
audioRouter.use(planRateLimit);

// POST /audio/generate — pro+ only, extra rate limit on this expensive endpoint
audioRouter.post(
  "/generate",
  requirePlan("pro", "enterprise"),
  generationRateLimit,
  audioController.generate
);

// GET /audio/jobs — any authenticated user
audioRouter.get("/jobs", audioController.listJobs);

// GET /audio/jobs/:id — any authenticated user (ownership enforced in service)
audioRouter.get("/jobs/:id", audioController.getJob);
