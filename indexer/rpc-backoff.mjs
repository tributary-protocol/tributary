const RATE_LIMIT_CODES = new Set([429, -32005]);

export function isRateLimitError(error) {
  const candidates = [
    error,
    error?.cause,
    error?.response,
    error?.response?.data,
    error?.response?.data?.error,
  ];

  return candidates.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    if (
      RATE_LIMIT_CODES.has(Number(candidate.status)) ||
      RATE_LIMIT_CODES.has(Number(candidate.statusCode)) ||
      RATE_LIMIT_CODES.has(Number(candidate.code))
    ) {
      return true;
    }

    const message = String(candidate.message ?? "").toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("too many requests")
    );
  });
}

export async function withRateLimitBackoff(
  operation,
  {
    initialDelayMs = 1_000,
    maxDelayMs = 60_000,
    sleep = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
    shouldStop = () => false,
    onBackoff = () => {},
  } = {},
) {
  let delayMs = initialDelayMs;

  for (;;) {
    if (shouldStop()) return undefined;

    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || shouldStop()) throw error;

      onBackoff(error, delayMs);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}
