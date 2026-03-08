/**
 * Add random jitter to a base time.
 * Prevents bot-like exact-minute posting cadence.
 */
export function addJitter(
  baseTime: Date,
  minMinutes = 1,
  maxMinutes = 30,
): Date {
  const jitter =
    Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
  return new Date(baseTime.getTime() + jitter * 60_000);
}
