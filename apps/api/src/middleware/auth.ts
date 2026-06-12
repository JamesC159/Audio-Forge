import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "enterprise";

export interface JwtPayload {
  sub: string;       // user ID
  email: string;
  plan: Plan;
  iat: number;
  exp: number;
}

// Extend Express Request so downstream handlers get full type safety
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expired" });
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  }
}

export function requirePlan(...plans: Plan[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPlan = req.user?.plan;
    if (!userPlan || !plans.includes(userPlan)) {
      res.status(403).json({
        error: `This endpoint requires one of: ${plans.join(", ")}`,
        yourPlan: userPlan ?? "unauthenticated",
      });
      return;
    }
    next();
  };
}
