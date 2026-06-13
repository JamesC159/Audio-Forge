import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { authRouter } from "../../routes/auth.js";

const JWT_SECRET = "auth-route-test-secret";

let baseUrl: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_EXPIRES_IN = "1h";

  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);

  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// ── POST /auth/token ──────────────────────────────────────────────────────────

describe("POST /auth/token", () => {
  async function post(body: unknown) {
    return fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 with a token and the default free plan", async () => {
    const res = await post({ email: "test@example.com" });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; plan: string };
    expect(typeof data.token).toBe("string");
    expect(data.plan).toBe("free");
  });

  it("returns the requested plan in the response body", async () => {
    const res = await post({ email: "pro@example.com", plan: "pro" });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { plan: string };
    expect(data.plan).toBe("pro");
  });

  it("issues a valid JWT that can be verified and decoded", async () => {
    const res = await post({ email: "verify@example.com", plan: "enterprise" });
    const { token } = (await res.json()) as { token: string };

    const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    expect(payload.email).toBe("verify@example.com");
    expect(payload.plan).toBe("enterprise");
    expect(typeof payload.sub).toBe("string");
    expect((payload.sub as string).startsWith("user_")).toBe(true);
  });

  it("returns 400 when the email is missing", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when the email is not a valid email address", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when plan is an unrecognised value", async () => {
    const res = await post({ email: "test@example.com", plan: "ultra" });
    expect(res.status).toBe(400);
  });

  it("accepts all valid plan values: free, pro, enterprise", async () => {
    for (const plan of ["free", "pro", "enterprise"] as const) {
      const res = await post({ email: `${plan}@example.com`, plan });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { plan: string };
      expect(data.plan).toBe(plan);
    }
  });

  it("returns an error object (not a token) for invalid input", async () => {
    const res = await post({ email: "bad" });
    const body = (await res.json()) as { error?: unknown };
    expect(body.error).toBeDefined();
  });
});
