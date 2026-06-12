// Typed circuit breaker — prevents cascade failures when downstream services degrade.
// Three states: CLOSED (normal), OPEN (fast-fail), HALF_OPEN (probe).

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** How many consecutive failures before opening */
  failureThreshold: number;
  /** How many consecutive successes in HALF_OPEN to close again */
  successThreshold: number;
  /** Ms to wait before entering HALF_OPEN after opening */
  timeout: number;
  /** Optional name for observability */
  name?: string;
}

export class CircuitBreaker<T> {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;

  constructor(
    private readonly fn: (...args: unknown[]) => Promise<T>,
    private readonly opts: CircuitBreakerOptions
  ) {
    this.name = opts.name ?? "unnamed";
  }

  get currentState(): CircuitState {
    return this.state;
  }

  async call(...args: unknown[]): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.opts.timeout) {
        this.transitionTo("HALF_OPEN");
      } else {
        throw new CircuitOpenError(
          `Circuit "${this.name}" is OPEN — retry after ${Math.ceil((this.opts.timeout - elapsed) / 1000)}s`
        );
      }
    }

    try {
      const result = await this.fn(...args);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.opts.successThreshold) {
        this.transitionTo("CLOSED");
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (
      this.state === "HALF_OPEN" ||
      this.failureCount >= this.opts.failureThreshold
    ) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(next: CircuitState) {
    this.state = next;
    this.successCount = 0;
    if (next === "CLOSED") this.failureCount = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}
