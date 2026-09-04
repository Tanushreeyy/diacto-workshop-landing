// Create the `automation` and `control` tabs a new campaign sheet needs.
//
// Idempotent: an existing tab is left completely alone, never rewritten. Safe to
// re-run. Touches only the tabs it creates — Meta's form tab is never written to.
//
//   node scripts/init-campaign-sheet.mjs <sheetId> [--flow lead_capture] [--env-file .env.production] [--dry]
//
// --flow picks which control-tab seed to write. Default is the workshop seed
// (sdr_assisted). `lead_capture` writes a seed with NO event rows at all — see
// the note above LEAD_CAPTURE_ROWS for why that emptiness is deliberate.
//
// The automation header is derived from the `A` map in lib/booking/service.ts
// rather than typed here, because checkAutomationTable() FAILS CLOSED: one missing
// or misspelled column and the tick refuses to send anything at all. Two hand-kept
// lists would drift, and the drift would only show up as a silent dead campaign.

import { readFileSync } from "fs";
import { JWT } from "google-auth-library";

const args = process.argv.slice(2);
const sheetId = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry");
const flowIdx = args.indexOf("--flow");
const flow = flowIdx >= 0 && args[flowIdx + 1] ? args[flowIdx + 1] : "sdr_assisted";
const efIdx = args.indexOf("--env-file");
const envPath = efIdx >= 0 && args[efIdx + 1] ? args[efIdx + 1] : ".env.production";

if (!sheetId) {
  console.error("Usage: node scripts/init-campaign-sheet.mjs <sheetId> [--flow lead_capture] [--env-file X] [--dry]");
  process.exit(1);
}
if (!["self_serve", "sdr_assisted", "lead_capture"].includes(flow)) {
  console.error(`Unknown --flow '${flow}'. One of: self_serve, sdr_assisted, lead_capture.`);
  process.exit(1);
}

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// ---- automation header, straight from service.ts's A map ----
const src = readFileSync("lib/booking/service.ts", "utf8");
const start = src.indexOf("const A = {");
const body = src.slice(start, src.indexOf("} as const;", start));
const AUTOMATION_HEADER = [...body.matchAll(/^\s*\w+:\s*"([^"]+)"/gm)].map((m) => m[1]);
if (AUTOMATION_HEADER.length < 20) {
  console.error(`Refusing to run: parsed only ${AUTOMATION_HEADER.length} columns from the A map.`);
  process.exit(1);
}

// ---- control tab seed ----
// Switches are read by control.ts today. The campaign_* rows are the Phase 0
// contract; they are inert until that lands, and harmless meanwhile.
const CONTROL_ROWS = [
  ["key", "value"],
  ["# — switches (read today) —", ""],
  ["ingest_enabled", "TRUE"],
  ["nurture_enabled", "FALSE"],
  ["reminders_enabled", "TRUE"],
  ["email_enabled", "TRUE"],
  ["whatsapp_enabled", "TRUE"],
  ["wa_delivery_check_enabled", "FALSE"],
  ["# — tab overrides —", ""],
  ["form_tab", "HR_Campaign"],
  ["automation_tab", "automation"],
  ["# — campaign (Phase 0) —", ""],
  ["flow", "sdr_assisted"],
  ["campaign_label", "HR Workshop — 12 Aug 2026"],
  ["reg_id_prefix", "HRW"],
  ["event_date_label", "Wednesday, 12 August 2026"],
  ["event_date_short", "Wed, 12 August"],
  ["event_time_label", "3:00 PM – 6:00 PM  (Check-in from 2:30 PM)"],
  ["event_venue", "901, B Wing, Prabhavee Tech Park, Baner, Pune"],
  ["event_map_url", "https://maps.app.goo.gl/MtpixrnbfgNFHYku5"],
  ["event_start_utc", "2026-08-12T09:30:00Z"],
  ["# — templates: set once Meta approves —", ""],
  ["tpl_wa_confirmation", "wa_5_hr_confirmation"],
  ["tpl_wa_day_before", "wa_6_hr_day_before"],
  ["tpl_wa_morning_of", "wa_7_hr_morning_of"],
  ["tpl_wa_two_hour", ""],
  ["tpl_wa_lead_alert", "wa_lead_alert_full"],
  ["lead_alert_number", ""],
];

// A lead_capture seed, and the notable thing about it is everything it leaves
// out. No event_* rows, no reg_id_prefix, no reminder offsets: this campaign has
// no event, and a plausible-looking placeholder date here is worse than an empty
// cell, because event_date_short is sent to people as a WhatsApp variable.
//
// nurture and reminders are seeded FALSE rather than TRUE. The flow ignores both,
// but a switch that reads ON while doing nothing is how an operator ends up
// debugging a ladder that was never going to run.
const LEAD_CAPTURE_ROWS = [
  ["key", "value"],
  ["# — switches —", ""],
  ["ingest_enabled", "TRUE"],
  ["nurture_enabled", "FALSE"],
  ["reminders_enabled", "FALSE"],
  ["email_enabled", "TRUE"],
  ["whatsapp_enabled", "TRUE"],
  ["wa_delivery_check_enabled", "FALSE"],
  ["# — tab overrides —", ""],
  ["form_tab", "LeadsSheet_New"],
  ["automation_tab", "automation"],
  ["# — campaign: no event, so no event_* rows —", ""],
  ["flow", "lead_capture"],
  // Printed in every Slack ping and, via {{1}}, in the ops WhatsApp alert. The
  // ops number and Slack channel are shared with both workshops, so this label
  // is the only thing telling an SDR which pitch a lead belongs to.
  ["campaign_label", "CandidHR Lead Gen"],
  ["campaign_id", "candidhr"],
  ["# — templates: set once Meta approves —", ""],
  ["tpl_wa_lead_followup", "wa_candidhr_lead_followup"],
  // BLANK ON PURPOSE — CandidHR notifies the SDR desk on SLACK ONLY.
  //
  // alertOpsNewLead() returns immediately when lead_alert_number is empty, so an
  // empty cell is the off switch and no WhatsApp ops alert is sent. Putting a
  // number here is what turns it on; do not do that without asking, because it
  // pings a person's phone on every single lead.
  //
  // The template name is still seeded so that IF it is ever switched on, it is
  // switched on correctly: it must be the CAMPAIGN-AWARE alert, never
  // wa_lead_alert_full, whose body opens with the literal words "Business
  // Transformation Blueprint" — a CandidHR lead would reach an SDR announced as
  // a founder-workshop registration.
  ["tpl_wa_lead_alert", "wa_lead_alert_campaign"],
  ["lead_alert_number", ""],
  ["# — the demo linked from WhatsApp {{2}} and the EM-10 button —", ""],
  ["demo_video_url", "https://www.youtube.com/watch?v=QycFhOi96LA"],
  // Printed as a tap-to-call link in the EM-10 footer. Blank falls back to
  // SUPPORT_NUMBER, which is the Diacto workshop line — a CandidHR lead who taps
  // it reaches people who have never heard of CandidHR.
  ["support_number", ""],
];

const SEED = flow === "lead_capture" ? LEAD_CAPTURE_ROWS : CONTROL_ROWS;

const jwt = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const API = "https://sheets.googleapis.com/v4/spreadsheets";

const meta = await jwt.request({ url: `${API}/${sheetId}?fields=properties.title,sheets.properties.title` });
const existing = meta.data.sheets.map((s) => s.properties.title);
console.log(`Sheet : ${meta.data.properties.title}`);
console.log(`Tabs  : ${existing.join(" | ")}\n`);

const plan = [
  { tab: "automation", rows: [AUTOMATION_HEADER] },
  { tab: "control", rows: SEED },
];

for (const { tab, rows } of plan) {
  if (existing.includes(tab)) {
    console.log(`• '${tab}' already exists — left untouched.`);
    continue;
  }
  console.log(`• '${tab}' will be created with ${rows[0].length} column(s), ${rows.length} row(s)`);
  if (tab === "automation") console.log(`    ${AUTOMATION_HEADER.join(" · ")}`);
  if (dry) continue;

  await jwt.request({
    url: `${API}/${sheetId}:batchUpdate`,
    method: "POST",
    data: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
  await jwt.request({
    url: `${API}/${sheetId}/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`,
    method: "PUT",
    data: { values: rows },
  });
  console.log(`    created.`);
}

console.log(dry ? "\nDRY RUN — nothing written." : "\nDone.");
