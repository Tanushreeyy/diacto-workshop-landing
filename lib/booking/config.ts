// Workshop constants + template/reminder configuration.
// Everything here is env-overridable, so the same build can run a different
// workshop without a code change. Defaults are the July 2026 Diacto event.

const opt = (k: string, d: string) => process.env[k] || d;

export const WORKSHOP = {
  regIdPrefix: opt("REG_ID_PREFIX", "HPT"), // High-Performance Teams
  eventMMDD: opt("EVENT_MMDD", "0717"), // used in the Registration ID (HPT-0717-####)
  dateLabel: opt("EVENT_DATE_LABEL", "Friday, 17 July 2026"),
  timeLabel: opt("EVENT_TIME_LABEL", "3:00 PM – 6:00 PM  (Check-in from 2:30 PM)"),
  venue: opt("EVENT_VENUE", "Prabhavee Tech Park, Baner, Pune"),
  mapUrl: opt("EVENT_MAP_URL", "https://maps.app.goo.gl/MtpixrnbfgNFHYku5?g_st=iw"),
  supportNumber: opt("SUPPORT_NUMBER", "+91 7387731069"),
  website: opt("BRAND_WEBSITE", "www.diacto.com"),
  fromName: opt("BRAND_FROM_NAME", "Team Diacto Technologies"),
  unsubscribeEmail: opt("UNSUBSCRIBE_EMAIL", "workshop@diacto.com"),
  // The single source of truth for scheduling. Fri 17 Jul 2026 15:00 IST.
  eventStartUtc: opt("EVENT_START_UTC", "2026-07-17T09:30:00Z"),
} as const;

// WATI template names — must match the templates approved in the WATI dashboard.
export const WA_TEMPLATES = {
  WA1: opt("WATI_TPL_WA1", "wa_1_booking_pending"), // registration link
  WA2: opt("WATI_TPL_WA2", "wa_2_value_nudge"),
  WA3: opt("WATI_TPL_WA3", "wa_3_problem_nudge"),
  WA4: opt("WATI_TPL_WA4", "wa_4_urgency_nudge"),
  WA5: opt("WATI_TPL_WA5", "wa_5_confirmation_link"), // + Event Pass link
  WA6: opt("WATI_TPL_WA6", "wa_6_day_before"),
  WA7: opt("WATI_TPL_WA7", "wa_7_morning_of"),
  WA8: opt("WATI_TPL_WA8", "wa_8_two_hour"),
} as const;

// Nurture ladder for leads who haven't finished registering:
// WA-2 (touch 1) → WA-3 (touch 2) → WA-4 (repeats twice daily until registered).
export const WA_NURTURE_LADDER = [
  WA_TEMPLATES.WA2,
  WA_TEMPLATES.WA3,
  WA_TEMPLATES.WA4,
] as const;

export type ReminderKind = "email" | "wa";

export interface ReminderSpec {
  key: string; // stored in reminders_sent to dedupe
  at: string; // absolute UTC ISO — due when now >= at
  kind: ReminderKind;
}

// Reminders are DERIVED from the event start, so moving the workshop means
// changing EVENT_START_UTC alone — not six hand-computed timestamps.
// Offsets (event = 15:00 IST):
//   -29h → the day before at 10:00 IST
//    -6h → the morning of at 09:00 IST
//    -2h → two hours before, at 13:00 IST
const startMs = Date.parse(WORKSHOP.eventStartUtc);
const before = (hours: number) =>
  new Date(startMs - hours * 3_600_000).toISOString();

export const REMINDERS: ReminderSpec[] = [
  { key: "EM6", at: before(29), kind: "email" },
  { key: "WA6", at: before(29), kind: "wa" },
  { key: "EM7", at: before(6), kind: "email" },
  { key: "WA7", at: before(6), kind: "wa" },
  { key: "EM8", at: before(2), kind: "email" },
  { key: "WA8", at: before(2), kind: "wa" },
];
