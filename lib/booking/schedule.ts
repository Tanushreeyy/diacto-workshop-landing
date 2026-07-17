// IST-aware scheduling helpers. Server runs in UTC; all wall-clock decisions
// are made against the Asia/Kolkata (UTC+05:30) calendar so host timezone and
// cron-in-UTC never cause a double-shift.

import { REMINDERS, ReminderSpec, WORKSHOP } from "./config";

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

export interface IstParts {
  year: number;
  month: number; // 0-based
  date: number;
  hour: number;
  minute: number;
}

export function istParts(now: Date = new Date()): IstParts {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth(),
    date: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  };
}

// Quiet hours: no WhatsApp/email nurture between 22:00 and 09:00 IST.
export function isQuietHours(now: Date = new Date()): boolean {
  const h = istParts(now).hour;
  return h < 9 || h >= 22;
}

// Daily nurture slots (IST): 10:00 and 17:00. WA + email fire once per slot.
const NURTURE_SLOTS = [10, 17];

// A pending lead is due when the day has passed a nurture slot that its last
// nudge predates. Robust to missed ticks (catches up the same day) and never
// exceeds two touches per day.
export function dueForNurture(lastNudgeAtIso: string, now: Date = new Date()): boolean {
  const np = istParts(now);
  const passed = NURTURE_SLOTS.filter((s) => np.hour >= s);
  if (passed.length === 0) return false; // before the first slot (10:00)
  const currentSlot = Math.max(...passed); // 10 or 17
  if (!lastNudgeAtIso) return true;
  const lastMs = Date.parse(lastNudgeAtIso);
  if (Number.isNaN(lastMs)) return true;
  const lp = istParts(new Date(lastMs));
  const sameDay =
    lp.year === np.year && lp.month === np.month && lp.date === np.date;
  if (!sameDay) return true; // last nudge on a prior day → due
  return lp.hour < currentSlot; // due if the last nudge predates this slot
}

// How long after its slot a reminder may still go out. Past this it is stale and
// is skipped rather than sent late. Deliberately SHORTER than the smallest gap
// between consecutive reminders (morning-of → 2h-before is 4h): if grace exceeded
// that gap, a late resume or a resubscribe could make two reminders due at once
// and fire "good morning" back-to-back with "starting in 2 hours". 3h gives ample
// catch-up for a tick outage while guaranteeing at most one reminder is ever due.
const REMINDER_GRACE_MS = 3 * 3_600_000;

// Reminders that are due for this lead: past their slot, not yet sent, and still
// meaningful.
//
// The window matters. Without an upper bound a reminder stays due FOREVER once
// its time passes, and every overdue one fires in the same pass — so a lead who
// unsubscribes and resubscribes on the day, or a tick that resumes late, gets
// "it's tomorrow!", "good morning!" and "starting in 2 hours" back to back within
// seconds. Bounding it means a late resume sends only what is still true, and
// nothing at all fires once the workshop has started.
export function dueReminders(
  remindersSentCsv: string,
  now: Date = new Date(),
): ReminderSpec[] {
  const sent = new Set(
    remindersSentCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const nowMs = now.getTime();
  const startMs = Date.parse(WORKSHOP.eventStartUtc);
  return REMINDERS.filter((r) => {
    if (sent.has(r.key)) return false;
    const atMs = Date.parse(r.at);
    if (nowMs < atMs) return false; // not yet
    if (nowMs >= startMs) return false; // the workshop is underway — say nothing
    return nowMs < atMs + REMINDER_GRACE_MS; // still timely
  });
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
