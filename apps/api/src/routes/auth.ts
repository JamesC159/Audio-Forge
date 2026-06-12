import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { JwtPayload, Plan } from "../middleware/auth.js";

export const authRouter = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["free", "pro", "enterprise"]).optional().default("free"),
});

// Demo endpoint — in production replace with real credential validation + DB lookup
authRouter.post("/token", (req, res) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");

  const payload: Omit<JwtPayload, "iat" | "exp"> = {
    sub: `user_${Date.now()}`,
    email: result.data.email,
    plan: result.data.plan as Plan,
  };

  const token = jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"],
  });

  res.json({ token, plan: payload.plan });
});
