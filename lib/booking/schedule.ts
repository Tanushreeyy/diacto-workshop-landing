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

// Nurture slots (IST): 10:00 morning, 17:00 evening.
const MORNING = 10;
const EVENING = 17;

// ONE nudge a day, alternating the time of day.
//
//   day 1  10:00   day 2  17:00   day 3  10:00   day 4  17:00 …
//
// It used to be both slots every day. That is twice the contact for the same
// message, and the July audit put a number on the cost: 48 people received three
// promotional emails in a single day, because the welcome mail landed on top of
// two nudges. Halving the frequency also removes any chance of a lead hitting the
// two-a-day promotional ceiling through nurture alone.
//
// Alternating rather than fixing one time is deliberate: someone who never reads
// mail before lunch would otherwise never see a single message, and the whole
// ladder would be wasted on them. Rotating gives every lead both a morning and an
// evening attempt across any two consecutive touches.
//
// The slot is chosen from the LAST nudge, not from the date, so the rhythm
// survives a paused campaign, a missed tick or a resubscribe: whatever came last,
// the other one comes next.
function slotOf(hour: number): typeof MORNING | typeof EVENING {
  return hour < EVENING ? MORNING : EVENING;
}

export function dueForNurture(lastNudgeAtIso: string, now: Date = new Date()): boolean {
  const np = istParts(now);

  // Never before the morning slot opens.
  if (np.hour < MORNING) return false;

  const lastMs = Date.parse(lastNudgeAtIso || "");
  // Never nudged: take whichever slot has opened today. A lead who arrives in the
  // afternoon should not wait until tomorrow morning for their first follow-up.
  if (!lastNudgeAtIso || Number.isNaN(lastMs)) return true;

  const lp = istParts(new Date(lastMs));

  // At most one a day, whatever else is true.
  if (lp.year === np.year && lp.month === np.month && lp.date === np.date) {
    return false;
  }

  // Alternate: morning last time means evening this time, and vice versa. The
  // check is `>=` so a slot that was missed entirely (an outage, a tick that
  // never ran) still goes out later the same day rather than being skipped.
  const wanted = slotOf(lp.hour) === MORNING ? EVENING : MORNING;
  return np.hour >= wanted;
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
