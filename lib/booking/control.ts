// Sheet-driven kill switches.
//
// The point is that pausing must not require a deploy. Everything else that can
// stop this system — the cron sidecar, an env var, renaming the automation tab —
// needs shell access to the VPS or a redeploy, so in practice it needs an email
// to whoever owns the host and a wait. These switches live in the spreadsheet,
// which the people running the campaign already have open.
//
// They are SEPARATE on purpose. The tick does three unrelated jobs and you almost
// always want to stop one without the others: pausing the follow-ups while the
// workshop's own reminders still go out on the day is the whole reason this
// exists. One global on/off would force a choice between spamming people and
// leaving 44 attendees with no reminder.
//
//   control tab (two columns, any order, header row 1):
//     key                 | value
//     ingest_enabled      | TRUE     -> WA-1 + EM-1 to brand-new form leads
//     nurture_enabled     | FALSE    -> WA-2/3/4 + EM-2/3/4 follow-ups
//     reminders_enabled   | TRUE     -> EM6-8 / WA6-8 on the day
//
// Fail-open is deliberate here, and it is the opposite of the call made in
// appendRow. A missing/unreadable control tab means ENABLED, so deploying this
// code against a spreadsheet that has no control tab changes no behaviour. Only
// an explicit FALSE stops anything. Fail-closed would mean one transient Sheets
// blip silently kills a live campaign — a much worse failure than the switch
// briefly not applying, and one nobody would notice until the event.
import { readTable, resolveHeader, cell, updateRow, appendRow } from "./google";
import { env } from "./env";

export interface Switches {
  ingest: boolean;
  nurture: boolean;
  reminders: boolean;
  source: string; // where the values came from — surfaced in /api/health
}

export const ALL_ON: Switches = {
  ingest: true,
  nurture: true,
  reminders: true,
  source: "default (no control tab)",
};

const isFalse = (v: string) => ["false", "no", "off", "0"].includes(v.trim().toLowerCase());

export async function readSwitches(): Promise<Switches> {
  // Resolved OUTSIDE the try on purpose. A missing control TAB is a normal state
  // and falls through to ALL_ON below; a missing SHEET_CONTROL_TAB *variable* is
  // a misconfiguration, and swallowing it here would silently hand a staging
  // deployment production's switches. Let that one throw.
  const tab = env.controlTab();
  let table;
  try {
    table = await readTable(tab);
  } catch {
    return ALL_ON; // tab absent -> unchanged behaviour
  }
  const cKey = resolveHeader(table, ["key", "setting", "name"]);
  const cVal = resolveHeader(table, ["value", "enabled", "state"]);
  if (!cKey || !cVal) return { ...ALL_ON, source: `'${table.tab}' present but has no key/value header` };

  const map = new Map<string, string>();
  for (const row of table.rows) {
    const k = cell(table, row, cKey).trim().toLowerCase();
    if (k) map.set(k, cell(table, row, cVal));
  }
  const on = (k: string) => !(map.has(k) && isFalse(map.get(k)!));
  return {
    ingest: on("ingest_enabled"),
    nurture: on("nurture_enabled"),
    reminders: on("reminders_enabled"),
    source: `'${table.tab}' (${map.size} setting(s))`,
  };
}

// ---- header baseline -------------------------------------------------------
//
// The known-good automation header, stored as an ordinary control-tab row so it
// is visible and correctable by hand. Kept HERE rather than in the automation
// tab on purpose: a baseline that lives in the file being watched is worthless,
// because whatever damages the header damages the baseline with it.
//
// First run records whatever it finds — there is no way to know the "right"
// header from cold, and refusing to run until a human types one in would just
// mean the guard gets disabled. From then on, any change is reported once and
// the baseline moves on, so a deliberate edit costs one Slack message rather
// than one every five minutes.
const BASELINE_KEY = "automation_header";

/** Read one control-tab setting. Null when absent or the tab is unreadable. */
export async function readSetting(key: string): Promise<string | null> {
  const tab = env.controlTab(); // see readSwitches — missing variable must throw
  try {
    const table = await readTable(tab);
    const cKey = resolveHeader(table, ["key", "setting", "name"]);
    const cVal = resolveHeader(table, ["value", "enabled", "state"]);
    if (!cKey || !cVal) return null;
    for (const row of table.rows) {
      if (cell(table, row, cKey).trim().toLowerCase() === key.toLowerCase()) {
        return cell(table, row, cVal);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Write one control-tab setting, creating the row if it isn't there yet. */
export async function writeSetting(key: string, value: string): Promise<void> {
  const table = await readTable(env.controlTab());
  const cKey = resolveHeader(table, ["key", "setting", "name"]);
  const cVal = resolveHeader(table, ["value", "enabled", "state"]);
  if (!cKey || !cVal) return;
  for (const row of table.rows) {
    if (cell(table, row, cKey).trim().toLowerCase() === key.toLowerCase()) {
      await updateRow(table, row.rowNumber, { [cVal]: value });
      return;
    }
  }
  await appendRow(table, { [cKey]: key, [cVal]: value });
}

export const readHeaderBaseline = () => readSetting(BASELINE_KEY);
export const writeHeaderBaseline = (fingerprint: string) =>
  writeSetting(BASELINE_KEY, fingerprint);
