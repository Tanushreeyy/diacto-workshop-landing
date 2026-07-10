// Non-secret workshop constants + template/reminder configuration.
// Copy/schedule live here so there is a single source of truth for the backend.

export const WORKSHOP = {
  regIdPrefix: "HPT", // High-Performance Teams
  eventMMDD: "0717", // used in the Registration ID (HPT-0717-####)
  dateLabel: "Friday, 17 July 2026",
  timeLabel: "3:00 PM – 6:00 PM  (Check-in from 2:30 PM)",
  venue: "Prabhavee Tech Park, Baner, Pune",
  mapUrl: "https://maps.app.goo.gl/MtpixrnbfgNFHYku5?g_st=iw",
  supportNumber: "+91 7387731069",
  website: "www.diacto.com",
  fromName: "Team Diacto Technologies",
  // The workshop starts Fri 17 Jul 2026 15:00 IST = 09:30 UTC.
  eventStartUtc: "2026-07-17T09:30:00Z",
} as const;

// WATI template names — must match templates created & approved in the WATI
// dashboard. Overridable via env so names can change without a code edit.
export const WA_TEMPLATES = {
  WA1: process.env.WATI_TPL_WA1 || "wa_1_booking_pending",
  WA2: process.env.WATI_TPL_WA2 || "wa_2_value_nudge",
  WA3: process.env.WATI_TPL_WA3 || "wa_3_problem_nudge",
  WA4: process.env.WATI_TPL_WA4 || "wa_4_urgency_nudge",
  WA5: process.env.WATI_TPL_WA5 || "wa_5_confirmation",
  WA6: process.env.WATI_TPL_WA6 || "wa_6_day_before",
  WA7: process.env.WATI_TPL_WA7 || "wa_7_morning_of",
  WA8: process.env.WATI_TPL_WA8 || "wa_8_two_hour",
} as const;

// Nurture ladder for pending leads: WA-2 (touch 1) → WA-3 (touch 2) →
// WA-4 (repeats twice daily until booked).
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
  optional?: boolean; // WA reminders are gated behind ENABLE_WA_REMINDERS
}

// Post-booking reminders — email + WhatsApp fire together at each milestone.
// Absolute UTC times, hardcoded from the IST schedule to avoid offset errors:
//   Day before  16 Jul 10:00 IST = 04:30Z → EM-2 + WA-6
//   Morning of  17 Jul 09:00 IST = 03:30Z → EM-3 + WA-7
//   2h before   17 Jul 13:00 IST = 07:30Z → EM-4 + WA-8
export const REMINDERS: ReminderSpec[] = [
  { key: "EM6", at: "2026-07-16T04:30:00Z", kind: "email" },
  { key: "WA6", at: "2026-07-16T04:30:00Z", kind: "wa" },
  { key: "EM7", at: "2026-07-17T03:30:00Z", kind: "email" },
  { key: "WA7", at: "2026-07-17T03:30:00Z", kind: "wa" },
  { key: "EM8", at: "2026-07-17T07:30:00Z", kind: "email" },
  { key: "WA8", at: "2026-07-17T07:30:00Z", kind: "wa" },
];
