import assert from "node:assert/strict";
import test from "node:test";
import { isRateLimitError, withRateLimitBackoff } from "./rpc-backoff.mjs";

test("recognizes HTTP and JSON-RPC rate-limit errors", () => {
  assert.equal(isRateLimitError({ response: { status: 429 } }), true);
  assert.equal(
    isRateLimitError({ response: { data: { error: { code: -32005 } } } }),
    true,
  );
  assert.equal(isRateLimitError({ message: "Too many requests" }), true);
  assert.equal(isRateLimitError({ response: { status: 500 } }), false);
});

test("backs off exponentially and resumes after the RPC recovers", async () => {
  const delays = [];
  let attempts = 0;

  const result = await withRateLimitBackoff(
    async () => {
      attempts += 1;
      if (attempts < 4) throw { response: { status: 429 } };
      return "recovered";
    },
    {
      initialDelayMs: 100,
      maxDelayMs: 250,
      sleep: async (delayMs) => delays.push(delayMs),
    },
  );

  assert.equal(result, "recovered");
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [100, 200, 250]);
});

test("does not retry non-rate-limit failures", async () => {
  let sleeps = 0;
  const failure = new Error("connection refused");

  await assert.rejects(
    withRateLimitBackoff(async () => Promise.reject(failure), {
      sleep: async () => {
        sleeps += 1;
      },
    }),
    failure,
  );
  assert.equal(sleeps, 0);
});
