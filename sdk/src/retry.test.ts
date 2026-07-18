import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  withRetry,
  defaultIsRetryable,
  type RetryOptions,
  type SleepFn,
} from "./retry.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** A fake sleep that records every requested delay and resolves instantly. */
function fakeSleep(): { sleepFn: SleepFn; delays: number[] } {
  const delays: number[] = [];
  const sleepFn: SleepFn = async (ms) => {
    delays.push(ms);
  };
  return { sleepFn, delays };
}

/** Build a function that fails `n` times then succeeds. */
function failNTimes<T>(n: number, value: T): () => Promise<T> {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= n) throw new Error(`transient failure #${calls}`);
    return value;
  };
}

/* ------------------------------------------------------------------ */
/*  withRetry                                                         */
/* ------------------------------------------------------------------ */

describe("withRetry", () => {
  it("returns the value on first success without sleeping", async () => {
    const { sleepFn, delays } = fakeSleep();
    const result = await withRetry(async () => 42, { sleep: sleepFn });
    assert.equal(result, 42);
    assert.equal(delays.length, 0);
  });

  it("retries transient errors up to maxAttempts", async () => {
    const { sleepFn, delays } = fakeSleep();
    const fn = failNTimes(2, "ok");
    const result = await withRetry(fn, { maxAttempts: 3, sleep: sleepFn });
    assert.equal(result, "ok");
    assert.equal(delays.length, 2); // slept before retry 2 and retry 3
  });

  it("throws after exhausting all attempts", async () => {
    const { sleepFn, delays } = fakeSleep();
    const fn = failNTimes(5, "never");
    await assert.rejects(
      () => withRetry(fn, { maxAttempts: 3, sleep: sleepFn }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /transient failure/);
        return true;
      },
    );
    // Two sleeps: between attempt 1→2 and 2→3
    assert.equal(delays.length, 2);
  });

  it("applies exponential backoff delays", async () => {
    const { sleepFn, delays } = fakeSleep();
    const fn = failNTimes(3, "ok");
    await withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      backoffMultiplier: 3,
      sleep: sleepFn,
    });
    // attempt 1 fails → sleep 100*3^0 = 100
    // attempt 2 fails → sleep 100*3^1 = 300
    // attempt 3 fails → sleep 100*3^2 = 900
    // attempt 4 succeeds
    assert.deepEqual(delays, [100, 300, 900]);
  });

  it("does not retry non-retryable errors", async () => {
    const { sleepFn, delays } = fakeSleep();
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new TypeError("bad argument");
    };
    await assert.rejects(
      () => withRetry(fn, { maxAttempts: 5, sleep: sleepFn }),
      (err: unknown) => err instanceof TypeError,
    );
    assert.equal(calls, 1);
    assert.equal(delays.length, 0);
  });

  it("supports a custom isRetryable predicate", async () => {
    const { sleepFn, delays } = fakeSleep();
    let calls = 0;
    const fn = async (): Promise<string> => {
      calls++;
      if (calls <= 2) throw new Error("retry me");
      if (calls === 3) throw new Error("stop here");
      return "never";
    };
    const isRetryable = (err: unknown) =>
      err instanceof Error && err.message === "retry me";

    await assert.rejects(
      () => withRetry(fn, { maxAttempts: 5, isRetryable, sleep: sleepFn }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, "stop here");
        return true;
      },
    );
    assert.equal(calls, 3);
    assert.equal(delays.length, 2);
  });

  it("throws RangeError when maxAttempts < 1", async () => {
    await assert.rejects(
      () => withRetry(async () => 1, { maxAttempts: 0 }),
      (err: unknown) => {
        assert.ok(err instanceof RangeError);
        assert.match(err.message, /maxAttempts/);
        return true;
      },
    );
  });

  it("uses default options when none are provided", async () => {
    // Just verify it doesn't throw when called with only a fn.
    // We use a function that succeeds immediately so it doesn't actually sleep.
    const result = await withRetry(async () => "default");
    assert.equal(result, "default");
  });

  it("preserves the original error type through retries", async () => {
    class RpcError extends Error {
      constructor(
        message: string,
        public readonly code: number,
      ) {
        super(message);
        this.name = "RpcError";
      }
    }
    const { sleepFn } = fakeSleep();
    let calls = 0;
    const fn = async (): Promise<never> => {
      calls++;
      throw new RpcError("service unavailable", 503);
    };
    await assert.rejects(
      () => withRetry(fn, { maxAttempts: 2, sleep: sleepFn }),
      (err: unknown) => {
        assert.ok(err instanceof RpcError);
        assert.equal((err as RpcError).code, 503);
        return true;
      },
    );
    assert.equal(calls, 2);
  });
});

/* ------------------------------------------------------------------ */
/*  defaultIsRetryable                                                */
/* ------------------------------------------------------------------ */

describe("defaultIsRetryable", () => {
  it("returns true for generic Error", () => {
    assert.equal(defaultIsRetryable(new Error("oops")), true);
  });

  it("returns false for TypeError", () => {
    assert.equal(defaultIsRetryable(new TypeError("bad")), false);
  });

  it("returns false for non-Error values", () => {
    assert.equal(defaultIsRetryable("string"), false);
    assert.equal(defaultIsRetryable(42), false);
    assert.equal(defaultIsRetryable(null), false);
    assert.equal(defaultIsRetryable(undefined), false);
  });

  it("returns true for Error subclasses that are not TypeError", () => {
    assert.equal(defaultIsRetryable(new RangeError("x")), true);
    assert.equal(defaultIsRetryable(new SyntaxError("x")), true);
  });
});
