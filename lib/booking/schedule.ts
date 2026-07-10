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

// The two daily nurture slots are 10:00 and 18:00 IST. Returns the active slot
// (10 or 18) if the current hour is in one of them, else null. An hourly tick
// therefore fires each lead at most twice a day.
export function nurtureSlot(now: Date = new Date()): 10 | 18 | null {
  const h = istParts(now).hour;
  if (h === 10) return 10;
  if (h === 18) return 18;
  return null;
}

function hoursBetween(aIso: string, now: Date): number {
  const t = Date.parse(aIso);
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / 3_600_000;
}

// A pending lead is due for a nudge when we're inside a slot and haven't nudged
// in the last 5h (guards against two ticks inside the same slot hour).
export function dueForNurture(lastNudgeAtIso: string, now: Date = new Date()): boolean {
  if (nurtureSlot(now) === null) return false;
  if (!lastNudgeAtIso) return true;
  return hoursBetween(lastNudgeAtIso, now) >= 5;
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
