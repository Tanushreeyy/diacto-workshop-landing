// Workshop constants + template/reminder configuration.
// Everything here is env-overridable, so the same build can run a different
// workshop without a code change. Defaults are the July 2026 Diacto event.

const opt = (k: string, d: string) => process.env[k] || d;

export const WORKSHOP = {
  regIdPrefix: opt("REG_ID_PREFIX", "HPT"), // High-Performance Teams
  eventMMDD: opt("EVENT_MMDD", "0724"), // used in the Registration ID (HPT-0724-####)
  dateLabel: opt("EVENT_DATE_LABEL", "Friday, 24 July 2026"),
  // Short label used both in the UI chip and as the WhatsApp date variable, so the
  // date is one env var everywhere — change it here (or via EVENT_DATE_SHORT) and
  // every message + the landing page move together, no template rebuild required.
  dateShort: opt("EVENT_DATE_SHORT", "Fri, 24 July"),
  timeLabel: opt("EVENT_TIME_LABEL", "3:00 PM – 6:00 PM  (Check-in from 2:30 PM)"),
  venue: opt("EVENT_VENUE", "Prabhavee Tech Park, Baner, Pune"),
  mapUrl: opt("EVENT_MAP_URL", "https://maps.app.goo.gl/MtpixrnbfgNFHYku5?g_st=iw"),
  supportNumber: opt("SUPPORT_NUMBER", "+91 7387731069"),
  website: opt("BRAND_WEBSITE", "www.diacto.com"),
  fromName: opt("BRAND_FROM_NAME", "Team Diacto Technologies"),
  unsubscribeEmail: opt("UNSUBSCRIBE_EMAIL", "workshop@diacto.com"),
  // The single source of truth for scheduling. Fri 24 Jul 2026 15:00 IST.
  eventStartUtc: opt("EVENT_START_UTC", "2026-07-24T09:30:00Z"),
} as const;

// WATI template names — must match the templates approved in the WATI dashboard.
//
// WA-1…WA-5 were rebuilt under NEW names (…_v2): the live templates hardcode the date
// in the body ("17 July"), and a Meta-approved template can't be edited in place, so
// the rebuild swaps that for the {{date}} variable. The old date-in-body originals
// stay live until deleted.
//
// WA-6…WA-8 are already APPROVED, emoji-free and dateless, so they keep their live
// names (verified via the WATI API). NOTE: WA-8's live name is "wa_two_hour" — the
// "wa_8_two_hour" template was deleted. Headers on all of them are plain text (WATI
// rejects header emojis; the live ones never had any).
export const WA_TEMPLATES = {
  WA1: opt("WATI_TPL_WA1", "wa_1_booking_pending_v2"), // registration link + date
  WA2: opt("WATI_TPL_WA2", "wa_2_value_nudge_v2"),
  WA3: opt("WATI_TPL_WA3", "wa_3_problem_nudge_v2"),
  WA4: opt("WATI_TPL_WA4", "wa_4_urgency_nudge_v2"),
  WA5: opt("WATI_TPL_WA5", "wa_5_confirmation_link_v2"), // + Event Pass link + date
  WA6: opt("WATI_TPL_WA6", "wa_6_day_before"),
  WA7: opt("WATI_TPL_WA7", "wa_7_morning_of"),
  WA8: opt("WATI_TPL_WA8", "wa_two_hour"),
} as const;

// Nurture ladder for leads who haven't finished registering:
// WA-2 (touch 1) → WA-3 (touch 2) → WA-4 (repeats twice daily until registered).
export const WA_NURTURE_LADDER = [
  WA_TEMPLATES.WA2,
  WA_TEMPLATES.WA3,
  WA_TEMPLATES.WA4,
] as const;

// ---- opt-out ----------------------------------------------------------------
//
// Why the reason is stored rather than a bare TRUE: the two triggers must not do
// the same thing. A reply means "a human is talking to us now" — stop CHASING
// them, but a registered attendee who says "see you there" must not thereby lose
// the reminder for the workshop they signed up for. An unsubscribe is a consent
// signal and stops everything, reminders included.
export const OPT_OUT = {
  reply: "reply", // inbound message — stops nurture only
  unsubscribe: "unsubscribe", // explicit opt-out — stops everything
  duplicate: "duplicate", // a raced/duplicate row retired by reconcile
} as const;
export type OptOutReason = (typeof OPT_OUT)[keyof typeof OPT_OUT];

// Inbound WhatsApp text that means "stop", matched case-insensitively against the
// whole trimmed message so "stop" opts out but "please stop sending at 9am, call
// me at 5" does not (that is a reply, and a human should read it).
export const STOP_WORDS = [
  "stop",
  "unsubscribe",
  "unsub",
  "opt out",
  "optout",
  "remove me",
  "do not contact",
  "dont contact",
  "leave me alone",
];

export function classifyInbound(text: string): OptOutReason {
  const t = (text || "").trim().toLowerCase().replace(/[.!]+$/, "");
  return STOP_WORDS.includes(t) ? OPT_OUT.unsubscribe : OPT_OUT.reply;
}

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
