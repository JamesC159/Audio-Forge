import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requirePlan } from "../../middleware/auth.js";
import type { JwtPayload } from "../../middleware/auth.js";

const SECRET = "test-jwt-secret-for-unit-tests";

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status, json } as unknown as Response, status, json };
}

function makeNext() {
  return vi.fn() as unknown as NextFunction;
}

function signedToken(overrides: Partial<Omit<JwtPayload, "iat" | "exp">> = {}) {
  return jwt.sign(
    { sub: "user-1", email: "test@example.com", plan: "free", ...overrides },
    SECRET,
    { expiresIn: "1h" }
  );
}

// ── requireAuth ───────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("calls next() and attaches the decoded user on a valid token", () => {
    const token = signedToken({ sub: "user-42", email: "hello@example.com", plan: "pro" });
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const { res } = makeRes();
    const next = makeNext();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.sub).toBe("user-42");
    expect(req.user?.email).toBe("hello@example.com");
    expect(req.user?.plan).toBe("pro");
  });

  it("returns 401 when the Authorization header is absent", () => {
    const req = { headers: {} } as unknown as Request;
    const { res, status, json } = makeRes();

    requireAuth(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Missing or malformed Authorization header" });
  });

  it("returns 401 when the Authorization header does not start with 'Bearer '", () => {
    const req = { headers: { authorization: "Basic abc123" } } as unknown as Request;
    const { res, status, json } = makeRes();

    requireAuth(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Missing or malformed Authorization header" });
  });

  it("does not call next() when the header is malformed", () => {
    const req = { headers: { authorization: "Basic abc" } } as unknown as Request;
    const { res } = makeRes();
    const next = makeNext();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 with 'Token expired' for an expired JWT", () => {
    const expired = jwt.sign(
      { sub: "u", email: "e@e.com", plan: "free" },
      SECRET,
      { expiresIn: "-1s" }
    );
    const req = { headers: { authorization: `Bearer ${expired}` } } as unknown as Request;
    const { res, status, json } = makeRes();

    requireAuth(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Token expired" });
  });

  it("returns 401 with 'Invalid token' for a token signed with the wrong secret", () => {
    const bad = jwt.sign({ sub: "u", email: "e@e.com", plan: "free" }, "wrong-secret");
    const req = { headers: { authorization: `Bearer ${bad}` } } as unknown as Request;
    const { res, status, json } = makeRes();

    requireAuth(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Invalid token" });
  });

  it("returns 401 with 'Invalid token' for a completely malformed token string", () => {
    const req = { headers: { authorization: "Bearer not.a.jwt.at.all" } } as unknown as Request;
    const { res, status, json } = makeRes();

    requireAuth(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Invalid token" });
  });

  it("throws when JWT_SECRET env var is not set", () => {
    const savedSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    const token = jwt.sign({ sub: "u", email: "e@e.com", plan: "free" }, SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const { res } = makeRes();

    expect(() => requireAuth(req, res, makeNext())).toThrow("JWT_SECRET env var is not set");

    process.env.JWT_SECRET = savedSecret; // restore for subsequent tests
  });
});

// ── requirePlan ───────────────────────────────────────────────────────────────

describe("requirePlan", () => {
  function reqWithPlan(plan: "free" | "pro" | "enterprise") {
    return { user: { sub: "u", email: "e@e.com", plan } } as unknown as Request;
  }

  it("calls next() when the user's plan is in the allowed list", () => {
    const req = reqWithPlan("pro");
    const next = makeNext();

    requirePlan("pro", "enterprise")(req, makeRes().res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() when the user's plan is the only allowed plan", () => {
    const req = reqWithPlan("enterprise");
    const next = makeNext();

    requirePlan("enterprise")(req, makeRes().res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when the user's plan is not in the allowed list", () => {
    const req = reqWithPlan("free");
    const { res, status, json } = makeRes();

    requirePlan("pro", "enterprise")(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ yourPlan: "free" })
    );
  });

  it("includes the required plans in the 403 error message", () => {
    const req = reqWithPlan("free");
    const { res, json } = makeRes();

    requirePlan("pro", "enterprise")(req, res, makeNext());

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "This endpoint requires one of: pro, enterprise" })
    );
  });

  it("returns 403 with yourPlan 'unauthenticated' when req.user is absent", () => {
    const req = {} as Request;
    const { res, status, json } = makeRes();

    requirePlan("pro")(req, res, makeNext());

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ yourPlan: "unauthenticated" })
    );
  });

  it("does not call next() when the plan check fails", () => {
    const req = reqWithPlan("free");
    const next = makeNext();

    requirePlan("pro")(req, makeRes().res, next);

    expect(next).not.toHaveBeenCalled();
  });
});
