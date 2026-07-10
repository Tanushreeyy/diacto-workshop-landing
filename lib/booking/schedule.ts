// IST-aware scheduling helpers. Server runs in UTC; all wall-clock decisions
// are made against the Asia/Kolkata (UTC+05:30) calendar so host timezone and
// cron-in-UTC never cause a double-shift.

import { REMINDERS, ReminderSpec } from "./config";

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

// Reminders that are past their scheduled time and not yet sent for this lead.
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
  return REMINDERS.filter(
    (r) => !sent.has(r.key) && nowMs >= Date.parse(r.at),
  );
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
