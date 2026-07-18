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
// Any opt-out reason stops ALL messaging (nurture AND reminders) — once a person
// has replied or unsubscribed we go quiet, full stop. The reason is stored rather
// than a bare TRUE only for audit and Slack context, not for different behaviour.
// Why the person is being left alone. This column records INTENT, and any value
// in it stops everything on every channel — nurture, follow-ups and reminders.
//
// Whether a channel physically works is a different question and lives in its
// own columns (email_dead / wa_dead). Keeping the two apart matters: a bounce is
// not consent to be left alone, and three of the addresses that hard-bounced in
// July belong to registered attendees whose phones work fine. Filing "the
// mailbox doesn't exist" under "they asked us to stop" would have cancelled
// their event-day reminders and they'd have shown up to nothing.
// ─── Lead status: one column, one vocabulary ───────────────────────────────
//
// Replaces opted_out / email_dead / wa_dead and their three timestamps. Those
// encoded the same idea three times, and the calling team had a fourth spelling
// of it in their own sheet, so the same person could be "Junk" to a caller and
// still queued for follow-ups by the automation. One column, shared with the
// callers, is the point.
//
// The honest cost of collapsing them: a row can now hold only ONE fact. Someone
// who replied AND whose mailbox bounces records the stronger of the two. That is
// acceptable because the weaker fact stops mattering once the stronger applies —
// we are not going to email a dead address of someone who told us to stop — but
// it is a real loss of detail, not a free simplification.
export const STATUS = {
  registered: "registered", // manual "they're in" — reminders yes, chasing no
  replied: "replied", // answered us on any channel
  unsubscribed: "unsubscribed", // asked to be removed
  not_interested: "not_interested", // caller established they don't want it
  junk: "junk", // caller marked the lead worthless
  duplicate: "duplicate", // same person as another row
  email_bounced: "email_bounced", // mailbox does not exist
  invalid_number: "invalid_number", // number cannot receive WhatsApp
  unreachable: "unreachable", // neither channel works
} as const;
export type LeadStatus = (typeof STATUS)[keyof typeof STATUS];

export interface Policy {
  email: boolean; // may we send email?
  wa: boolean; // may we send WhatsApp?
  nurture: boolean; // may we chase them?
  reminders: boolean; // may we send event-day reminders?
}

const ACTIVE: Policy = { email: true, wa: true, nurture: true, reminders: true };
const SILENT: Policy = { email: false, wa: false, nurture: false, reminders: false };

// What each status permits. Reminders are treated as separable from chasing on
// purpose: a registered attendee whose mailbox bounces must still be reminded on
// the day, over WhatsApp, or they turn up to nothing.
const POLICY: Record<LeadStatus, Policy> = {
  [STATUS.registered]: { email: true, wa: true, nurture: false, reminders: true },
  [STATUS.replied]: SILENT,
  [STATUS.unsubscribed]: SILENT,
  [STATUS.not_interested]: SILENT,
  [STATUS.junk]: SILENT,
  [STATUS.duplicate]: SILENT,
  [STATUS.unreachable]: SILENT,
  [STATUS.email_bounced]: { email: false, wa: true, nurture: true, reminders: true },
  [STATUS.invalid_number]: { email: true, wa: false, nurture: true, reminders: true },
};

// Which status wins when two are in play. Consent outranks deliverability: a
// bounce must never overwrite an unsubscribe, or clearing the bounce later would
// quietly switch that person's WhatsApp back on.
const RANK: Record<LeadStatus, number> = {
  [STATUS.unsubscribed]: 6,
  [STATUS.not_interested]: 5,
  [STATUS.junk]: 5,
  [STATUS.replied]: 4,
  [STATUS.duplicate]: 4,
  [STATUS.unreachable]: 3,
  [STATUS.email_bounced]: 2,
  [STATUS.invalid_number]: 2,
  [STATUS.registered]: 1,
};

// The calling team types their own spellings, and humans type variants. Map
// everything onto the canonical vocabulary; anything unrecognised but non-empty
// is treated as a full stop, because an unknown marking a human deliberately
// wrote is far more likely to mean "leave them alone" than "carry on".
const ALIASES: Record<string, LeadStatus> = {
  "junk": STATUS.junk,
  "not interested": STATUS.not_interested,
  "notinterested": STATUS.not_interested,
  "registered": STATUS.registered,
  "invalid/ not reachable number": STATUS.invalid_number,
  "invalid/not reachable number": STATUS.invalid_number,
  "invalid number": STATUS.invalid_number,
  "not reachable": STATUS.invalid_number,
  "wrong number": STATUS.invalid_number,
  "bounced": STATUS.email_bounced,
  "email bounced": STATUS.email_bounced,
  "unsubscribe": STATUS.unsubscribed,
  "unsubscribed": STATUS.unsubscribed,
  "reply": STATUS.replied,
  "replied": STATUS.replied,
  "duplicate": STATUS.duplicate,
  "unreachable": STATUS.unreachable,
};

/** Canonical status for whatever is in the cell. "" when the cell is empty. */
export function normalizeStatus(raw: string): LeadStatus | "" {
  const t = (raw || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!t) return "";
  const direct = (Object.values(STATUS) as string[]).find(
    (v) => v.replace(/_/g, " ") === t,
  );
  if (direct) return direct as LeadStatus;
  if (ALIASES[t]) return ALIASES[t];
  return STATUS.not_interested; // unknown but deliberate → stop
}

/** What this row is allowed to receive. */
export function policyFor(raw: string): Policy {
  const s = normalizeStatus(raw);
  return s ? POLICY[s] : ACTIVE;
}

/** Would `next` be an upgrade on `current`? Used to never soften a stop. */
export function outranks(next: LeadStatus, current: string): boolean {
  const cur = normalizeStatus(current);
  if (!cur) return true;
  return RANK[next] > RANK[cur];
}

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

export function classifyInbound(text: string): LeadStatus {
  const t = (text || "").trim().toLowerCase().replace(/[.!]+$/, "");
  return STOP_WORDS.includes(t) ? STATUS.unsubscribed : STATUS.replied;
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
