// One campaign, as a single named thing.
//
// WHY THIS EXISTS
//
// Everything that describes "which workshop are we running" used to be scattered:
// the date in WORKSHOP (config.ts), the template names in WA_TEMPLATES, the sheet
// in an env var, the tab names in another, the reminder times computed at module
// load from a constant. Nothing you could point at and call "the HR workshop" —
// just a pile of settings that happened to describe one.
//
// That is not a tidiness complaint. On 1 Aug 2026 the live campaign was found to
// be running with EVENT_* unset in production, i.e. on dates and a venue baked
// into config.ts from a PREVIOUS workshop. Nothing detected it, because nothing
// was in a position to: no single place knew what the campaign was supposed to be,
// so no single place could check.
//
// So: one object, loaded once per entry point, validated before anything is sent.
//
// WHERE THE VALUES COME FROM
//
//   env         → secrets, and the pointer to the sheet (SHEET_ID)
//   control tab → the campaign itself, so ops can set the date with no deploy
//   config.ts   → fallback defaults, for campaigns predating this file
//
// The sheet IS the campaign: adding next week's workshop is a new sheet plus one
// env var, not eight variables and a hope that none were missed.

import { readTable, resolveHeader, cell } from "./google";
import { env } from "./env";
import { WORKSHOP, WA_TEMPLATES, WA_LEAD_ALERT_TEMPLATE, ReminderSpec } from "./config";

// ---- flow -------------------------------------------------------------------
//
// The two shapes a campaign can take. This is the difference that a pile of
// switches cannot express, because it is about WHEN things happen, not whether.
//
//   self_serve   — the lead confirms themselves. Ingest sends a booking link, the
//                  nurture ladder chases whoever hasn't tapped it, and the
//                  confirmation + Event Pass are earned by completing the landing
//                  page form. (Founder / BTB campaigns.)
//
//   sdr_assisted — the form submission IS the registration ("Confirmation Step 1").
//                  Ingest sends the confirmation + Event Pass straight away, there
//                  is no booking link and no ladder, and humans (SDRs, then the
//                  client's team) confirm attendance by phone. The landing page is
//                  out of the funnel entirely. (HR Workshop, Aug 2026.)
//
// Reminders are the SAME in both: day before, morning of, two hours before. The
// flow decides what happens at ingest and whether anyone gets chased — not what
// happens on event day.
export const FLOWS = ["self_serve", "sdr_assisted"] as const;
export type Flow = (typeof FLOWS)[number];

export interface CampaignEvent {
  regIdPrefix: string;
  /**
   * MMDD of the event in IST, for the registration ID (HRW-0812-####).
   *
   * DERIVED from startUtc rather than configured separately. It was its own env
   * var (EVENT_MMDD), which meant the reg-ID date could silently disagree with
   * the date in every message — two sources for one fact, and nothing comparing
   * them. IST because that is the date attendees and the ops team see.
   */
  mmdd: string;
  dateLabel: string;
  dateShort: string;
  timeLabel: string;
  venue: string;
  mapUrl: string;
  startUtc: string;
  startMs: number;
  /**
   * The Event Pass PDF's left panel — the campaign's branding.
   *
   * These were literals inside pass.ts, so the HR workshop's first 42 passes
   * went out headed "HIGH-PERFORMANCE TEAMS WORKSHOP" and footed "FOUNDERS &
   * BUSINESS OWNERS ONLY", while the right panel of the same page correctly
   * read HR Workshop, 12 August. An HR manager reading that could reasonably
   * decide the event was not for them.
   *
   * Blank means "keep the literal", so a pre-Phase-0 sheet is untouched.
   */
  pass: {
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    pillar1: string;
    pillar2: string;
    tagline: string;
    audience: string;
  };
}

export interface Campaign {
  id: string;
  label: string;
  flow: Flow;
  event: CampaignEvent;
  templates: {
    wa1: string; wa2: string; wa3: string; wa4: string;
    wa5: string; wa6: string; wa7: string; wa8: string;
    leadAlert: string;
  };
  reminders: ReminderSpec[];
  /**
   * True when the control tab actually describes this campaign, false for a
   * pre-Phase-0 sheet running on env/config defaults.
   *
   * It decides how strict validation is. On an unmanaged sheet a blank template
   * name legitimately means "use the configured default". On a MANAGED one it
   * means somebody left a cell empty, and the default it would inherit belongs to
   * the PREVIOUS campaign — which is how the HR workshop nearly went out with the
   * founder workshop's two-hour reminder attached.
   */
  managed: boolean;
  /** Where the values came from — surfaced in /api/health, like Switches.source. */
  source: string;
}

// ---- reminder schedule ------------------------------------------------------
//
// Derived from the event start so that moving the workshop means changing ONE
// value, not six hand-computed timestamps. Offsets assume a 15:00 IST start:
//   -29h → 10:00 IST the day before
//    -6h → 09:00 IST the morning of
//    -2h → 13:00 IST, two hours before
// A campaign that does not start at 15:00 IST must set reminder_offsets_hours
// explicitly, or -29h lands at some arbitrary hour.
const DEFAULT_OFFSETS = [29, 6, 2];
const KEYS_AT: Record<number, [string, string]> = {
  29: ["EM6", "WA6"],
  6: ["EM7", "WA7"],
  2: ["EM8", "WA8"],
};

function remindersFor(startMs: number, offsets: number[]): ReminderSpec[] {
  const out: ReminderSpec[] = [];
  for (const h of offsets) {
    const at = new Date(startMs - h * 3_600_000).toISOString();
    const [emKey, waKey] = KEYS_AT[h] ?? [`EM@${h}h`, `WA@${h}h`];
    out.push({ key: emKey, at, kind: "email" });
    out.push({ key: waKey, at, kind: "wa" });
  }
  return out;
}

// ---- validation -------------------------------------------------------------
//
// FAIL CLOSED, and deliberately the opposite of readSwitches (control.ts), which
// fails OPEN. The asymmetry is the point:
//
//   a missing SWITCH  means "no opinion, carry on"  — one Sheets blip must never
//                                                     silently kill a live campaign
//   a broken CAMPAIGN means "we do not know what we
//                            are running"           — and confidently messaging
//                                                     people about the wrong date
//                                                     is worse than sending nothing
//
// So an unreadable control tab is fatal here, while a control tab that simply has
// no campaign rows is not: that is a pre-Phase-0 sheet, and it falls back to the
// env/config values it has always used.
export function campaignProblems(c: Campaign): string[] {
  const p: string[] = [];
  if (!(FLOWS as readonly string[]).includes(c.flow)) {
    p.push(`flow '${c.flow}' is not one of: ${FLOWS.join(", ")}`);
  }
  if (!c.event.startUtc || Number.isNaN(c.event.startMs)) {
    p.push(`event_start_utc '${c.event.startUtc}' is missing or not a valid ISO timestamp`);
  }
  for (const [k, v] of Object.entries({
    event_date_label: c.event.dateLabel,
    event_date_short: c.event.dateShort,
    event_venue: c.event.venue,
    reg_id_prefix: c.event.regIdPrefix,
  })) {
    if (!String(v).trim()) p.push(`${k} is blank`);
  }
  // The confirmation is the one message EVERY flow sends, so a blank name here
  // means the campaign cannot do its job at all.
  if (!c.templates.wa5.trim()) p.push(`tpl_wa_confirmation is blank`);
  if (c.flow === "self_serve" && !c.templates.wa1.trim()) {
    p.push(`flow is self_serve but tpl_wa_booking_pending is blank — nothing would ` +
      `carry the booking link`);
  }

  // Cross-campaign template bleed. A blank cell on a managed campaign falls back
  // to the env/config default, and that default is whatever the LAST campaign
  // used — so the message goes out branded for a workshop that already happened.
  // Caught here rather than trusted to whoever fills the sheet in.
  if (c.managed) {
    const needed: [string, string][] = [
      ["tpl_wa_confirmation", c.templates.wa5],
      ["tpl_wa_day_before", c.templates.wa6],
      ["tpl_wa_morning_of", c.templates.wa7],
      ["tpl_wa_two_hour", c.templates.wa8],
      ...(c.flow === "self_serve"
        ? ([
            ["tpl_wa_booking_pending", c.templates.wa1],
            ["tpl_wa_value_nudge", c.templates.wa2],
            ["tpl_wa_problem_nudge", c.templates.wa3],
            ["tpl_wa_urgency_nudge", c.templates.wa4],
          ] as [string, string][])
        : []),
    ];
    for (const [key, name] of needed) {
      if (!name.trim()) {
        p.push(`${key} is blank on a managed campaign — it would fall back to the ` +
          `previous campaign's template`);
      }
    }
  }
  return p;
}

/**
 * Has this campaign finished?
 *
 * Auto-stop at the event start, so last week's sheet cannot quietly keep
 * ingesting leads and firing reminders once its workshop has happened. Derived
 * from the event itself rather than a flag somebody has to remember to set.
 */
export function hasEnded(c: Campaign, now: number = Date.now()): boolean {
  return Number.isFinite(c.event.startMs) && now >= c.event.startMs;
}

// ---- loading ----------------------------------------------------------------

const num = (s: string): number[] =>
  s.split(",").map((x) => parseFloat(x.trim())).filter((n) => Number.isFinite(n));

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** MMDD of an instant, on the IST wall-clock. "" when the instant is invalid. */
function mmddIst(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const ist = new Date(ms + IST_OFFSET_MS);
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  return `${mm}${dd}`;
}

/**
 * Build the campaign from the control tab, falling back to env/config.
 *
 * Throws when the control tab cannot be READ — see campaignProblems for why that
 * is fatal rather than fail-open. A readable tab with no campaign rows is fine
 * and yields exactly the pre-Phase-0 behaviour.
 */
export async function loadCampaign(): Promise<Campaign> {
  const tab = env.controlTab();
  let map = new Map<string, string>();
  let source: string;
  try {
    const table = await readTable(tab);
    const cKey = resolveHeader(table, ["key", "setting", "name"]);
    const cVal = resolveHeader(table, ["value", "enabled", "state"]);
    if (cKey && cVal) {
      for (const row of table.rows) {
        const k = cell(table, row, cKey).trim().toLowerCase();
        if (k && !k.startsWith("#")) map.set(k, cell(table, row, cVal).trim());
      }
    }
    source = `'${tab}' (${map.size} row(s))`;
  } catch (e) {
    throw new Error(
      `campaign config unreadable: control tab '${tab}' could not be read ` +
        `(${(e as Error).message}). Refusing to run — falling back to a stale date ` +
        `would message people about the wrong workshop.`,
    );
  }

  const get = (key: string, fallback: string) => {
    const v = map.get(key);
    return v === undefined || v === "" ? fallback : v;
  };
  // Nothing campaign-shaped in the tab at all → legacy sheet, env/config rules.
  const hasCampaignRows = ["flow", "event_start_utc", "event_date_short"].some((k) =>
    (map.get(k) || "").trim(),
  );
  if (!hasCampaignRows) source += " — no campaign rows, using env/config defaults";

  // Template names deliberately do NOT inherit on a managed campaign.
  //
  // Falling back would resolve a blank cell to the previous campaign's template —
  // silently, and looking entirely healthy. That is not hypothetical: the HR
  // workshop's control tab was seeded with tpl_wa_two_hour blank while the
  // template was still awaiting Meta approval, and it resolved to `wa_two_hour`,
  // the founder workshop's reminder. Left alone, HR attendees would have received
  // a two-hour reminder for a workshop that had already happened.
  //
  // Blank stays blank, and campaignProblems() halts the tick until it is filled in.
  const tpl = (key: string, legacyDefault: string) =>
    hasCampaignRows ? (map.get(key) || "").trim() : get(key, legacyDefault);

  const startUtc = get("event_start_utc", WORKSHOP.eventStartUtc);
  const startMs = Date.parse(startUtc);
  const offsets = map.get("reminder_offsets_hours")
    ? num(map.get("reminder_offsets_hours")!)
    : DEFAULT_OFFSETS;

  return {
    id: get("campaign_id", get("reg_id_prefix", WORKSHOP.regIdPrefix).toLowerCase()),
    label: get("campaign_label", WORKSHOP.dateLabel),
    flow: get("flow", "self_serve") as Flow,
    event: {
      regIdPrefix: get("reg_id_prefix", WORKSHOP.regIdPrefix),
      mmdd: mmddIst(startMs) || WORKSHOP.eventMMDD,
      dateLabel: get("event_date_label", WORKSHOP.dateLabel),
      dateShort: get("event_date_short", WORKSHOP.dateShort),
      timeLabel: get("event_time_label", WORKSHOP.timeLabel),
      venue: get("event_venue", WORKSHOP.venue),
      mapUrl: get("event_map_url", WORKSHOP.mapUrl),
      startUtc,
      startMs,
      // Blank (not a literal default) so pass.ts keeps its own fallback — that
      // way an unmanaged sheet renders exactly the pass it always did.
      pass: {
        titleLine1: get("pass_title_line1", ""),
        titleLine2: get("pass_title_line2", ""),
        subtitle: get("pass_subtitle", ""),
        pillar1: get("pass_pillar_1", ""),
        pillar2: get("pass_pillar_2", ""),
        tagline: get("pass_tagline", ""),
        audience: get("pass_audience", ""),
      },
    },
    templates: {
      wa1: tpl("tpl_wa_booking_pending", WA_TEMPLATES.WA1),
      wa2: tpl("tpl_wa_value_nudge", WA_TEMPLATES.WA2),
      wa3: tpl("tpl_wa_problem_nudge", WA_TEMPLATES.WA3),
      wa4: tpl("tpl_wa_urgency_nudge", WA_TEMPLATES.WA4),
      wa5: tpl("tpl_wa_confirmation", WA_TEMPLATES.WA5),
      wa6: tpl("tpl_wa_day_before", WA_TEMPLATES.WA6),
      wa7: tpl("tpl_wa_morning_of", WA_TEMPLATES.WA7),
      wa8: tpl("tpl_wa_two_hour", WA_TEMPLATES.WA8),
      leadAlert: tpl("tpl_wa_lead_alert", WA_LEAD_ALERT_TEMPLATE),
    },
    reminders: Number.isFinite(startMs) ? remindersFor(startMs, offsets) : [],
    managed: hasCampaignRows,
    source,
  };
}

/** One-line description for Slack and /api/health. */
export function describeCampaign(c: Campaign): string {
  return (
    `${c.label} [${c.flow}] · ${c.event.dateShort} · start ${c.event.startUtc} · ` +
    `${c.reminders.length} reminder(s) · ${c.source}`
  );
}
