// What the LANDING PAGE shows. Deliberately NOT the same source as the messaging.
//
// This page used to read its date/venue straight off WORKSHOP (lib/booking/config.ts),
// which is the config the tick uses to send WhatsApp and email. One source, two
// consumers — fine while the site and the campaign were the same event.
//
// They no longer are. From the HR workshop onward the Meta form sends people to
// diacto.com, so this page is out of the funnel and the client asked for it to stay
// exactly as it is. But the campaign underneath still has to flip to the new event
// every week. Sharing the variables means flipping EVENT_DATE_SHORT / EVENT_VENUE for
// the new campaign would silently repaint THIS page with the new event's date while
// the headline below still advertises the old one — a page contradicting itself,
// which is worse than either being correct.
//
// So the two are split:
//   EVENT_*          → the campaign currently being SENT   (lib/booking/config.ts)
//   LANDING_EVENT_*  → what this PAGE displays             (here)
//
// The defaults below are literals, not env reads, so the page holds its current
// content with no variables set at all. Set LANDING_EVENT_* only if this page ever
// needs to move independently of the campaign.
//
// Safe to read plain (non-NEXT_PUBLIC) env here: every component that renders these
// values — Hero, FinalCTA, Footer, EventChips — is a SERVER component. The client
// ones (BookButton, StickyCTA, Header) use only `ctaText`, which is a literal. Putting
// a date or venue into a client component would read `undefined` in the browser
// bundle and silently fall back to the default.

const opt = (k: string, d: string) => process.env[k] || d;

export const EVENT = {
  title: opt("LANDING_EVENT_TITLE", "Business Transformation Blueprint"),
  subtitle: opt(
    "LANDING_EVENT_SUBTITLE",
    "FREE Practical Workshop for Founders & Business Owners — Achieve 10X Business Growth in Just 1 Year",
  ),
  venue: opt("LANDING_EVENT_VENUE", "901, B Wing, Prabhavee Tech Park, Baner, Pune"),
  mapUrl: opt("LANDING_EVENT_MAP_URL", "https://maps.app.goo.gl/MtpixrnbfgNFHYku5?g_st=iw"),
  timeLabel: opt("LANDING_EVENT_TIME_LABEL", "3:00 PM – 6:00 PM"),
  // Was "This Friday" — ambiguous once the event is more than a week out. Now an
  // explicit date. Previously driven by EVENT_DATE_SHORT, i.e. the campaign's date;
  // now this page's own, so a campaign flip cannot move it.
  dayLabel: opt("LANDING_EVENT_DATE_SHORT", "Sat, 1 August"),
  ctaText: opt("LANDING_EVENT_CTA", "BOOK YOUR FREE SPOT"),
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
