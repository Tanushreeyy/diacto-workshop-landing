// Central source of truth for all workshop copy + scheduling.
// BACKEND INTEGRATION: booking CTA connects to booking workflow later. No backend logic now.

export const EVENT = {
  title: "How To Hire, Train & Retain Employees",
  subtitle:
    "FREE Practical Workshop for Founders & Business Owners of Private Limited & Limited Companies",
  venue: "Prabhavee Tech Park, Baner, Pune",
  timeLabel: "3:00 PM – 6:00 PM",
  dayLabel: "This Friday",
  ctaText: "BOOK YOUR FREE SPOT",
} as const;

// Workshop runs 15:00 IST (Asia/Kolkata) and doors close at 18:00 IST.
const IST_OFFSET_MINUTES = 5 * 60 + 30; // UTC+05:30
const WORKSHOP_START_HOUR_IST = 15; // 3:00 PM
const WORKSHOP_END_HOUR_IST = 18; // 6:00 PM
const FRIDAY = 5; // JS getUTCDay(): Sun=0 … Fri=5

/**
 * Returns the upcoming workshop date as a Date at Friday 15:00 IST.
 *
 * Timezone-safe: all reasoning happens on the IST wall-clock regardless of the
 * visitor's local timezone. We shift "now" into IST, decide which Friday the
 * event falls on, then convert that IST wall-clock moment back to a real
 * (UTC-anchored) Date instance.
 *
 * Rules:
 *  - If today is Friday and it is before 18:00 IST → the event is TODAY.
 *  - After Friday 18:00 IST (doors closed) → roll forward to next Friday.
 *
 * Pure function: given the same `now`, always returns the same result.
 */
export function getNextWorkshopDate(now: Date = new Date()): Date {
  // Wall-clock "now" as seen in IST (values below are IST calendar fields).
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const istYear = istNow.getUTCFullYear();
  const istMonth = istNow.getUTCMonth();
  const istDate = istNow.getUTCDate();
  const istDay = istNow.getUTCDay();
  const istHour = istNow.getUTCHours();

  // Days until the target Friday (0 when today is Friday).
  let daysUntilFriday = (FRIDAY - istDay + 7) % 7;

  // If it's Friday but doors have already closed (>= 18:00 IST), skip to next.
  if (daysUntilFriday === 0 && istHour >= WORKSHOP_END_HOUR_IST) {
    daysUntilFriday = 7;
  }

  // Build the IST wall-clock moment for the event (Friday 15:00 IST) as a UTC
  // timestamp, then subtract the IST offset to get the true UTC instant.
  const eventIstWallClock = Date.UTC(
    istYear,
    istMonth,
    istDate + daysUntilFriday,
    WORKSHOP_START_HOUR_IST,
    0,
    0,
    0,
  );

  return new Date(eventIstWallClock - IST_OFFSET_MINUTES * 60_000);
}
