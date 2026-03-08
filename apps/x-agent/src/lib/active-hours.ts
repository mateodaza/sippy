import type { BrandVoice } from '../brands/types.js';

/**
 * Get the current hour in the brand's local timezone.
 */
export function getLocalHour(timezone: string, now = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(now), 10);
}

/**
 * Check if the current time is within the brand's active posting hours.
 * Uses local timezone — start < end always (no midnight wraparound).
 */
export function isWithinActiveHours(
  brand: BrandVoice,
  now = new Date(),
): boolean {
  const localHour = getLocalHour(brand.timezone, now);
  return localHour >= brand.activeHours.start && localHour < brand.activeHours.end;
}

/**
 * Calculate the next active-hours window start as a UTC Date.
 * If currently within active hours, returns now.
 * If outside, returns the next day's start hour (in local time, converted to UTC).
 */
export function nextActiveWindowStart(
  brand: BrandVoice,
  now = new Date(),
): Date {
  if (isWithinActiveHours(brand, now)) return now;

  const localHour = getLocalHour(brand.timezone, now);

  // If we're before today's window, it starts later today
  // If we're after today's window, it starts tomorrow
  const hoursUntilStart =
    localHour < brand.activeHours.start
      ? brand.activeHours.start - localHour
      : 24 - localHour + brand.activeHours.start;

  return new Date(now.getTime() + hoursUntilStart * 60 * 60 * 1000);
}
