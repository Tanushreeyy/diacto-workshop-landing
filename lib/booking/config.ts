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
  WA4: process.env.WATI_TPL_WA4 || "wa_4_scarcity_nudge",
  WA5: process.env.WATI_TPL_WA5 || "wa_5_final_nudge",
  WA6: process.env.WATI_TPL_WA6 || "wa_6_confirmation",
  WAR1: process.env.WATI_TPL_WAR1 || "wa_r1_morning",
  WAR2: process.env.WATI_TPL_WAR2 || "wa_r2_two_hour",
} as const;

// Ordered WhatsApp nurture ladder (advances one step per twice-daily touch).
export const WA_NURTURE_LADDER = [
  WA_TEMPLATES.WA2,
  WA_TEMPLATES.WA3,
  WA_TEMPLATES.WA4,
  WA_TEMPLATES.WA5, // WA5 repeats once the ladder is exhausted
] as const;

export type ReminderKind = "email" | "wa";

export interface ReminderSpec {
  key: string; // stored in reminders_sent to dedupe
  at: string; // absolute UTC ISO — due when now >= at
  kind: ReminderKind;
  optional?: boolean; // WA reminders are gated behind ENABLE_WA_REMINDERS
}

// Absolute reminder times (UTC). Hardcoded from the IST schedule to avoid any
// offset math errors:
//   EM-2  16 Jul 10:00 IST = 2026-07-16T04:30:00Z
//   EM-3  17 Jul 09:00 IST = 2026-07-17T03:30:00Z
//   EM-4  17 Jul 13:00 IST = 2026-07-17T07:30:00Z
export const REMINDERS: ReminderSpec[] = [
  { key: "EM2", at: "2026-07-16T04:30:00Z", kind: "email" },
  { key: "EM3", at: "2026-07-17T03:30:00Z", kind: "email" },
  { key: "WAR1", at: "2026-07-17T03:30:00Z", kind: "wa", optional: true },
  { key: "EM4", at: "2026-07-17T07:30:00Z", kind: "email" },
  { key: "WAR2", at: "2026-07-17T07:30:00Z", kind: "wa", optional: true },
];
