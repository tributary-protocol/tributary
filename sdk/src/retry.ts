/**
 * Retry/backoff wrapper for transient RPC errors.
 *
 * Only idempotent read calls should be retried — never state-mutating
 * operations where a duplicate send could cause double-spends or other
 * on-chain side-effects.
 */

/** Configuration for the retry behaviour. */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Must be ≥ 1. Default: 3. */
  maxAttempts?: number;
  /** Initial delay in milliseconds before the first retry. Default: 500. */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each retry. Default: 2. */
  backoffMultiplier?: number;
  /** Optional predicate — return `true` for errors that should be retried.
   *  Defaults to retrying every `Error` that is not a `TypeError`. */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/**
 * Default retry predicate.
 *
 * We retry anything that looks like a transient network / RPC failure:
 *  - Generic `Error` instances (timeout, connection refused, 502/503/504, …)
 *
 * We do *not* retry:
 *  - `TypeError` — usually a programming mistake (wrong args, etc.)
 *  - Non-`Error` throws (rethrown immediately)
 */
export function defaultIsRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof TypeError) return false;
  return true;
}

/** Tiny helper so callers can swap the sleep implementation in tests. */
export type SleepFn = (ms: number) => Promise<void>;

export const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute `fn` with retry + exponential backoff.
 *
 * ```ts
 * const split = await withRetry(() => client.get_split({ id: 1n }));
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions & { sleep?: SleepFn },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const initialDelayMs = options?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const backoffMultiplier =
    options?.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
  const isRetryable = options?.isRetryable ?? defaultIsRetryable;
  const sleep = options?.sleep ?? defaultSleep;

  if (maxAttempts < 1) {
    throw new RangeError("maxAttempts must be >= 1");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === maxAttempts;
      if (isLastAttempt || !isRetryable(err)) {
        throw err;
      }

      const delayMs =
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      await sleep(delayMs);
    }
  }

  /* istanbul ignore next — logically unreachable, satisfies TS control-flow */
  throw lastError;
}
