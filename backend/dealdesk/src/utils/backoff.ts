export function nextRetryDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponent = Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 1001);

  return Math.min(baseMs * 2 ** exponent + jitter, maxMs);
}
