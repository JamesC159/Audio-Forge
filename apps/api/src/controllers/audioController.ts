import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { audioService } from "../services/audioService.js";

const GenerateSchema = z.object({
  prompt: z.string().min(3).max(500),
  durationSec: z.number().int().min(5).max(300).optional(),
});

export const audioController = {
  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const body = GenerateSchema.parse(req.body);
      const job = await audioService.generate({
        userId: req.user!.sub,
        prompt: body.prompt,
        durationSec: body.durationSec,
      });
      res.status(202).json(job);
    } catch (err) {
      next(err);
    }
  },

  async getJob(req: Request, res: Response, next: NextFunction) {
    try {
      const job = await audioService.getJob(req.params.id!, req.user!.sub);
      res.json(job);
    } catch (err) {
      next(err);
    }
  },

  async listJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const jobs = await audioService.listJobs(req.user!.sub);
      res.json({ jobs, count: jobs.length });
    } catch (err) {
      next(err);
    }
  },
};
