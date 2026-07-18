// Refuse to run when the automation tab doesn't look like the automation tab,
// and speak up whenever its header changes at all.
//
// Written after 17 July 2026, when someone blanked the lead_id header cell and
// sorted the tab by column A. That dragged the header to row 26, so readTable
// treated a data row as the header, every column lookup returned "", and the
// dedupe sets came back empty. Every lead then looked brand new on every tick:
// 813 emails to 29 people in three hours, 35 of them to one person who had
// already asked us to stop twice.
//
// Nothing there was a bug in the sending path — the sends were exactly what the
// code was told to do. The failure was that a damaged spreadsheet still looked
// usable. So the guard belongs before any work starts: if the table cannot be
// trusted, do nothing and say so loudly.
//
// FAIL CLOSED, unlike the control tab (see control.ts). A missing control tab
// means "no opinion, carry on"; a malformed automation tab means "the thing that
// stops us double-messaging people is gone". The costs are not symmetrical — a
// skipped tick is invisible, a tick that sends 35 times is a complaint.

// Type-only import, and a local reader, so this module pulls in nothing at
// runtime. The guard that decides whether it is safe to send should not depend
// on the credential-loading, network-touching module it is guarding.
import type { Table, SheetRow } from "./google";

const at = (t: Table, r: SheetRow, header: string): string => {
  const i = t.index[header];
  return i === undefined ? "" : r.cells[i] ?? "";
};

// Columns without which dedupe, suppression or addressing silently degrade.
// Their ABSENCE is fatal. Their position is not — readTable resolves by name —
// but a move still gets reported, because a header that moved on its own is
// evidence someone edited the sheet by hand.
const REQUIRED = [
  "lead_id",
  "phone_key",
  "email",
  "confirm_token",
  "registration_complete",
  "nurture_stage",
  "opted_out",
  "opted_out_at",
  "email_dead",
  "wa_dead",
] as const;

export interface Preflight {
  ok: boolean;
  problems: string[];
}

/** Fatal checks. ok === false means: send nothing this tick. */
export function checkAutomationTable(auto: Table): Preflight {
  const problems: string[] = [];

  const missing = REQUIRED.filter((c) => !(c in auto.index));
  if (missing.length) {
    problems.push(
      `missing column(s): ${missing.join(", ")} — the header row is blank, moved or renamed`,
    );
  }

  // Duplicates are worse than missing, because nothing looks wrong: readTable's
  // index keeps the LAST occurrence, so a stray second "opted_out" column would
  // silently become the one we read, and every suppression check would consult an
  // empty column.
  const seen = new Map<string, number>();
  for (const h of auto.header) {
    const k = h.trim();
    if (!k) continue; // blank headers are the calling team's columns — not ours
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = Array.from(seen.entries()).filter(([, n]) => n > 1);
  if (dupes.length) {
    problems.push(
      `duplicated column(s): ${dupes.map(([h, n]) => `${h} x${n}`).join(", ")} — reads would silently use the wrong one`,
    );
  }

  if (auto.rows.length > 0 && !missing.length) {
    // The tell-tale of the July incident: plenty of rows, none identifiable. If
    // every lead_id AND every phone_key reads empty while rows exist, the header
    // is misaligned even though the names are all present.
    const ids = auto.rows.filter((r) => at(auto, r, "lead_id").trim()).length;
    const phones = auto.rows.filter((r) => at(auto, r, "phone_key").trim()).length;
    if (ids === 0 && phones === 0) {
      problems.push(
        `${auto.rows.length} row(s) but not one has a lead_id or phone_key — dedupe would match nothing and every lead would re-send`,
      );
    }
    // A token is how a row is addressed at all. Losing most of them means the
    // column shifted under us.
    const tokens = auto.rows.filter((r) => at(auto, r, "confirm_token").trim()).length;
    if (tokens * 2 < auto.rows.length) {
      problems.push(
        `only ${tokens} of ${auto.rows.length} row(s) have a confirm_token — the column looks shifted`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

// ---- header drift ----------------------------------------------------------
//
// The fatal checks above only catch damage severe enough to break us. A rename,
// a reorder, or an inserted column can leave everything working today and break
// something subtly tomorrow — and either way it means a human edited the sheet,
// which is exactly the event nobody noticed last time. So the exact header is
// fingerprinted and any change at all is reported.

export const headerFingerprint = (auto: Table): string =>
  auto.header.map((h) => h.trim()).join("|");

export interface HeaderDrift {
  changed: boolean;
  added: string[];
  removed: string[];
  moved: string[]; // same name, different position
  summary: string;
}

export function detectHeaderDrift(auto: Table, baseline: string): HeaderDrift {
  const now = auto.header.map((h) => h.trim());
  const was = baseline.split("|");
  const nowSet = new Set(now.filter(Boolean));
  const wasSet = new Set(was.filter(Boolean));

  const added = Array.from(nowSet).filter((h) => !wasSet.has(h));
  const removed = Array.from(wasSet).filter((h) => !nowSet.has(h));
  const moved = Array.from(nowSet).filter(
    (h) => wasSet.has(h) && now.indexOf(h) !== was.indexOf(h),
  );

  const parts: string[] = [];
  if (added.length) parts.push(`added ${added.join(", ")}`);
  if (removed.length) parts.push(`REMOVED ${removed.join(", ")}`);
  if (moved.length) parts.push(`moved ${moved.join(", ")}`);
  if (!parts.length && now.join("|") !== baseline) parts.push("column order changed");

  return {
    changed: now.join("|") !== baseline,
    added,
    removed,
    moved,
    summary: parts.join(" · ") || "no change",
  };
}

// ---- blast-radius limits ---------------------------------------------------
//
// Not business rules — ceilings. No single tick should be able to message a
// large fraction of the list, whatever goes wrong upstream. Sized against real
// traffic: a handful of new leads per tick, and a nurture ladder that touches
// each person twice a day. Above these it isn't a busy day, it's a malfunction —
// so stop, leave the rest for the next tick, and alert. A genuine burst of leads
// is merely delayed five minutes.
//
// Reminders are deliberately NOT capped. They are bounded by reminders_sent in
// the sheet, they only fire in a window before the event, and on event morning
// they legitimately go to every registered attendee at once. Capping them could
// leave an attendee with no reminder — and they are already covered by the
// preflight above, which is what would have stopped the July incident outright.
export const MAX_INGEST_PER_TICK = 15;
export const MAX_NURTURE_PER_TICK = 30;
