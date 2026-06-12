import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../logging/logger.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      issues: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ err, path: req.path }, err.message);
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Unexpected — log full error, hide details from client
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
