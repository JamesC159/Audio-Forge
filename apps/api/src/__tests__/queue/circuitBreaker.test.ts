import { describe, it, expect, vi, afterEach } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "../../queue/circuitBreaker.js";

afterEach(() => {
  vi.useRealTimers();
});

const baseOpts = { failureThreshold: 3, successThreshold: 2, timeout: 1000 };

describe("CircuitBreaker — CLOSED state", () => {
  it("starts in CLOSED state", () => {
    const cb = new CircuitBreaker(vi.fn(), baseOpts);
    expect(cb.currentState).toBe("CLOSED");
  });

  it("calls the fn and returns its result", async () => {
    const fn = vi.fn().mockResolvedValue("value");
    const cb = new CircuitBreaker(fn, baseOpts);

    const result = await cb.call("arg1", "arg2");

    expect(result).toBe("value");
    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("re-throws fn errors without opening below the threshold", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const cb = new CircuitBreaker(fn, { ...baseOpts, failureThreshold: 3 });

    await expect(cb.call()).rejects.toThrow("boom");
    await expect(cb.call()).rejects.toThrow("boom");

    expect(cb.currentState).toBe("CLOSED"); // 2 failures < threshold of 3
  });

  it("opens after reaching the failure threshold", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = new CircuitBreaker(fn, { ...baseOpts, failureThreshold: 3 });

    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow();

    expect(cb.currentState).toBe("OPEN");
  });

  it("resets the failure count on a successful call", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("fail"));

    const cb = new CircuitBreaker(fn, { ...baseOpts, failureThreshold: 3 });

    await expect(cb.call()).rejects.toThrow(); // failure 1
    await expect(cb.call()).rejects.toThrow(); // failure 2
    await cb.call();                           // success → resets count to 0
    await expect(cb.call()).rejects.toThrow(); // failure 1 again

    expect(cb.currentState).toBe("CLOSED"); // 1 failure after reset, need 3 to open
  });
});

describe("CircuitBreaker — OPEN state", () => {
  it("fast-fails with CircuitOpenError without calling the fn", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = new CircuitBreaker(fn, { failureThreshold: 2, successThreshold: 2, timeout: 60_000 });

    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow();
    expect(cb.currentState).toBe("OPEN");

    fn.mockClear();
    await expect(cb.call()).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("includes the circuit name and retry hint in the error message", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = new CircuitBreaker(fn, {
      failureThreshold: 1,
      successThreshold: 1,
      timeout: 60_000,
      name: "s3-upload",
    });

    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow(/s3-upload/);
  });

  it("transitions to HALF_OPEN after the timeout elapses", async () => {
    vi.useFakeTimers();

    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = new CircuitBreaker(fn, { failureThreshold: 2, successThreshold: 2, timeout: 1000 });

    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow();
    expect(cb.currentState).toBe("OPEN");

    vi.advanceTimersByTime(1001);
    fn.mockResolvedValue("ok");

    // First call after timeout enters HALF_OPEN, then calls fn
    await cb.call();
    expect(cb.currentState).toBe("HALF_OPEN"); // 1 success, need 2 to close
  });

  it("stays OPEN if called before the timeout elapses", async () => {
    vi.useFakeTimers();

    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = new CircuitBreaker(fn, { failureThreshold: 2, successThreshold: 2, timeout: 5000 });

    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow();

    vi.advanceTimersByTime(4999); // not past timeout yet

    await expect(cb.call()).rejects.toBeInstanceOf(CircuitOpenError);
    expect(cb.currentState).toBe("OPEN");
  });
});

describe("CircuitBreaker — HALF_OPEN state", () => {
  async function openThenAdvance(opts = { failureThreshold: 2, successThreshold: 2, timeout: 1000 }) {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    const cb = new CircuitBreaker(fn, opts);

    await expect(cb.call()).rejects.toThrow();
    await expect(cb.call()).rejects.toThrow();
    vi.advanceTimersByTime(1001);

    return { fn, cb };
  }

  it("transitions back to OPEN on failure in HALF_OPEN", async () => {
    const { fn, cb } = await openThenAdvance();

    fn.mockRejectedValue(new Error("still failing"));
    await expect(cb.call()).rejects.toThrow();

    expect(cb.currentState).toBe("OPEN");
  });

  it("stays in HALF_OPEN until successThreshold is reached", async () => {
    const { fn, cb } = await openThenAdvance();

    fn.mockResolvedValue("ok");
    await cb.call(); // 1 success

    expect(cb.currentState).toBe("HALF_OPEN"); // needs 2 to close
  });

  it("closes after successThreshold consecutive successes", async () => {
    const { fn, cb } = await openThenAdvance();

    fn.mockResolvedValue("recovered");
    await cb.call(); // 1st success
    await cb.call(); // 2nd success → closes

    expect(cb.currentState).toBe("CLOSED");
  });

  it("resets the failure count when closing from HALF_OPEN", async () => {
    const { fn, cb } = await openThenAdvance({ failureThreshold: 2, successThreshold: 1, timeout: 1000 });

    fn.mockResolvedValue("ok");
    await cb.call(); // closes
    expect(cb.currentState).toBe("CLOSED");

    // One failure should not re-open (threshold is 2, count was reset)
    fn.mockRejectedValue(new Error("blip"));
    await expect(cb.call()).rejects.toThrow();
    expect(cb.currentState).toBe("CLOSED");
  });
});

describe("CircuitOpenError", () => {
  it("is an Error subclass named CircuitOpenError", () => {
    const err = new CircuitOpenError("circuit is open");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CircuitOpenError");
    expect(err.message).toBe("circuit is open");
  });
});
