import { describe, it, expect, vi } from "vitest";
import { z, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";
import { AppError, errorHandler } from "../../middleware/errorHandler.js";

vi.mock("../../logging/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  logMetric: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status, json } as unknown as Response, status, json };
}

const req = { path: "/test-path" } as unknown as Request;
const next = vi.fn() as unknown as NextFunction;

function makeZodError(): ZodError {
  const schema = z.object({ email: z.string().email(), count: z.number() });
  const result = schema.safeParse({ email: "bad", count: "not-a-number" });
  return (result as { error: ZodError }).error;
}

// ── AppError ──────────────────────────────────────────────────────────────────

describe("AppError", () => {
  it("sets statusCode, message, and optional code", () => {
    const err = new AppError(404, "Not found", "JOB_NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.code).toBe("JOB_NOT_FOUND");
  });

  it("sets name to 'AppError'", () => {
    expect(new AppError(500, "Oops").name).toBe("AppError");
  });

  it("extends Error", () => {
    expect(new AppError(400, "Bad")).toBeInstanceOf(Error);
  });

  it("allows code to be omitted (undefined)", () => {
    const err = new AppError(403, "Forbidden");
    expect(err.code).toBeUndefined();
  });
});

// ── errorHandler ──────────────────────────────────────────────────────────────

describe("errorHandler — ZodError", () => {
  it("responds 400 with validation error and field issues", () => {
    const { res, status, json } = makeRes();
    errorHandler(makeZodError(), req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Validation error" })
    );
  });

  it("includes fieldErrors in the issues object", () => {
    const { res, json } = makeRes();
    errorHandler(makeZodError(), req, res, next);

    const payload = json.mock.calls[0][0] as { issues: Record<string, unknown> };
    expect(payload.issues).toHaveProperty("email");
    expect(payload.issues).toHaveProperty("count");
  });
});

describe("errorHandler — AppError", () => {
  it("uses the AppError's statusCode", () => {
    const { res, status } = makeRes();
    errorHandler(new AppError(404, "Not found"), req, res, next);
    expect(status).toHaveBeenCalledWith(404);
  });

  it("returns 403 for a 403 AppError", () => {
    const { res, status } = makeRes();
    errorHandler(new AppError(403, "Forbidden"), req, res, next);
    expect(status).toHaveBeenCalledWith(403);
  });

  it("returns the AppError message and code in the body", () => {
    const { res, json } = makeRes();
    errorHandler(new AppError(409, "Conflict", "DUPLICATE"), req, res, next);
    expect(json).toHaveBeenCalledWith({ error: "Conflict", code: "DUPLICATE" });
  });

  it("includes code as undefined when none was set", () => {
    const { res, json } = makeRes();
    errorHandler(new AppError(500, "Server error"), req, res, next);
    expect(json).toHaveBeenCalledWith({ error: "Server error", code: undefined });
  });
});

describe("errorHandler — unexpected errors", () => {
  it("responds 500 for a plain Error", () => {
    const { res, status, json } = makeRes();
    errorHandler(new Error("unexpected crash"), req, res, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("responds 500 for a non-Error throw (string, object, etc.)", () => {
    const { res, status } = makeRes();
    errorHandler("something went wrong", req, res, next);
    expect(status).toHaveBeenCalledWith(500);
  });

  it("does not leak the original error message to the client", () => {
    const { res, json } = makeRes();
    errorHandler(new Error("SECRET DB PASSWORD IN LOGS"), req, res, next);

    const body = json.mock.calls[0][0] as { error: string };
    expect(body.error).not.toContain("SECRET");
  });
});
