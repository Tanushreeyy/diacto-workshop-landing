// NECESSITY CHECK — READ-ONLY, sends nothing.
//
// check-env.mjs answers "will it boot?". This answers the different question:
// for the campaign that is actually live, is every single thing it will NEED
// present — and is anything configured that it will never use?
//
// The two failure modes it exists to catch are the ones that have actually bitten:
// something missing that only reveals itself when a real lead arrives, and
// something left over from the previous campaign that still looks configured.
//
//   npx tsx scripts/necessity-check.mts [path-to-env]

import { readFileSync } from "fs";

const envPath = process.argv[2] || ".env.production";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { loadCampaign, campaignProblems, hasEnded, describeCampaign } =
  await import("../lib/booking/campaign.js");
const { readSwitches, readSetting, loadTabOverrides } = await import("../lib/booking/control.js");
const { readTable, resolveHeader } = await import("../lib/booking/google.js");
const { env } = await import("../lib/booking/env.js");
const { emailFor } = await import("../lib/booking/messages.js");

let need = 0, warn = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const NEED = (m: string) => { need++; console.log(`  NEED  ${m}`); };
const WARN = (m: string) => { warn++; console.log(`  warn  ${m}`); };

await loadTabOverrides();
const c = await loadCampaign();

console.log(`\n${describeCampaign(c)}\n`);

// ── 1. Is this campaign even runnable? ───────────────────────────────────────
console.log("1. campaign config");
const problems = campaignProblems(c);
problems.length ? problems.forEach((p) => NEED(p)) : ok("control tab validates clean");
hasEnded(c)
  ? NEED(`campaign has ENDED (started ${c.event.startUtc}) — the tick will halt`)
  : ok(`event ahead: ${c.event.startUtc} (${Math.round((c.event.startMs - Date.now()) / 3_600_000)}h away)`);

const sw = await readSwitches();
console.log(`  ..... switches: ${JSON.stringify(sw)}`);
if (!sw.ingest) NEED("ingest_enabled is FALSE — new leads will not be picked up");
else ok("ingest_enabled TRUE");
if (!sw.reminders) NEED("reminders_enabled is FALSE — nothing goes out on the day");
else ok("reminders_enabled TRUE");
if (!sw.email) WARN("email_enabled FALSE");
if (!sw.whatsapp) WARN("whatsapp_enabled FALSE");
// nurture is flow-dependent, not universally required.
if (c.flow === "sdr_assisted" && sw.nurture)
  WARN("nurture_enabled TRUE on an sdr_assisted flow — the ladder is skipped anyway, but the switch misleads");
if (c.flow === "self_serve" && !sw.nurture)
  NEED("nurture_enabled FALSE on a self_serve flow — nobody will be chased to book");

// ── 2. Only what THIS flow will actually send ────────────────────────────────
console.log(`\n2. WhatsApp templates required by flow '${c.flow}'`);
const endpoint = (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const token = process.env.WATI_ACCESS_TOKEN || "";
const live = new Map<string, any>();
for (let p = 1; p <= 20; p++) {
  const r = await fetch(`${endpoint}/api/v1/getMessageTemplates?pageSize=100&pageNumber=${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) { NEED(`WATI list failed: ${r.status}`); break; }
  const j: any = await r.json();
  const items = j.messageTemplates || j.result || j.data || [];
  for (const t of items) live.set(t.elementName || t.templateName || t.name, t);
  if (items.length < 100) break;
}

// sdr_assisted registers at ingest, so the booking ladder (wa1-wa4) is never sent.
const usedRoles = c.flow === "sdr_assisted"
  ? ["wa5", "wa6", "wa7", "wa8"]
  : ["wa1", "wa2", "wa3", "wa4", "wa5", "wa6", "wa7", "wa8"];
const unusedRoles = (["wa1", "wa2", "wa3", "wa4", "wa5", "wa6", "wa7", "wa8"] as const)
  .filter((r) => !usedRoles.includes(r));

let marketing = 0;
for (const role of usedRoles) {
  const name = (c.templates as any)[role] as string;
  if (!name) { NEED(`${role}: no template set, but this flow sends it`); continue; }
  const t = live.get(name);
  if (!t) { NEED(`${role}: '${name}' does not exist on WATI`); continue; }
  const status = (t.status || t.templateStatus || "?").toUpperCase();
  const cat = (t.category || t.templateCategory || "?").toUpperCase();
  if (status !== "APPROVED") NEED(`${role}: '${name}' is ${status}, not APPROVED`);
  else {
    if (cat === "MARKETING") marketing++;
    ok(`${role}: ${name} APPROVED [${cat}]`);
  }
}
for (const role of unusedRoles) {
  const name = (c.templates as any)[role] as string;
  if (name) WARN(`${role}: '${name}' is set but flow '${c.flow}' never sends it`);
}

// ── 3. Ops alert: configured, or configured-looking? ─────────────────────────
console.log("\n3. internal lead alert");
const alertNums = ((await readSetting("lead_alert_number")) || "")
  .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
if (!alertNums.length) {
  WARN("lead_alert_number is blank — no WhatsApp ping to SDRs on a new lead (Slack still fires)");
} else {
  const name = c.templates.leadAlert;
  const t = name ? live.get(name) : null;
  const status = t ? (t.status || t.templateStatus || "?").toUpperCase() : "MISSING";
  const wants7 = (name || "").includes("full");
  if (status !== "APPROVED") NEED(`lead alert '${name}' is ${status}`);
  else ok(`${alertNums.length} number(s) · ${name} APPROVED · sends ${wants7 ? 7 : 2} params`);
}
if (!process.env.SLACK_WEBHOOK_URL) NEED("SLACK_WEBHOOK_URL unset — no lead visibility at all");
else ok("Slack webhook set");

// ── 4. The tabs this campaign will actually touch ────────────────────────────
console.log("\n4. sheet tabs");
console.log(`  ..... sheet ${env.sheetId()}`);
for (const [label, tab] of [
  ["form", env.formTabs().join(",")],
  ["automation", env.autoTab()],
  ["control", env.controlTab()],
] as const) {
  try {
    const t = await readTable(tab);
    ok(`${label} tab '${tab}' readable — ${t.rows.length} row(s)`);
    if (label === "form") {
      // The four fields that silently failed to resolve on the HR form last week.
      for (const [field, cands] of Object.entries({
        designation: ["designation", "your_designation", "what_is_your_designation", "whats_your_designation"],
        company: ["company_name", "company", "organization_name", "organisation_name", "enter_your_company_name"],
        employee_count: ["employee_count", "employees", "team_size", "whats_your_employee_count"],
        location: ["location", "city", "where_are_you_located", "your_location"],
      })) {
        resolveHeader(t, cands)
          ? ok(`  form column '${field}' resolves`)
          : WARN(`  form column '${field}' does not resolve — it will be blank on every lead`);
      }
    }
  } catch (e: any) {
    NEED(`${label} tab '${tab}' unreadable: ${e.message}`);
  }
}

// ── 5. Emails this flow sends must render ────────────────────────────────────
console.log("\n5. email templates this flow sends");
const ctx = {
  firstName: "Priya", bookingLink: "https://x/?rid=T", passUrl: "https://x/api/pass?rid=T",
  dateLabel: c.event.dateLabel, dateShort: c.event.dateShort, timeLabel: c.event.timeLabel,
  venue: c.event.venue, mapUrl: c.event.mapUrl, support: "7387731069",
  unsubscribeLink: "https://x/api/unsubscribe?rid=T",
};
for (const kind of ["EM5", "EM6", "EM7", "EM8"]) {
  try {
    const { subject, html } = emailFor(kind as any, ctx as any);
    const leftovers = [...html.matchAll(/\{\{\s*([\w ]+)\s*\}\}/g)].map((m) => m[1]);
    if (leftovers.length) NEED(`${kind}: unfilled placeholder(s) ${[...new Set(leftovers)].join(", ")}`);
    else if (!/unsubscribe/i.test(html)) NEED(`${kind}: no unsubscribe link`);
    else ok(`${kind}: renders, unsubscribe present — "${subject.slice(0, 52)}…"`);
  } catch (e: any) {
    NEED(`${kind}: render failed — ${e.message}`);
  }
}

// ── 6. Deliverability reality check ──────────────────────────────────────────
console.log("\n6. deliverability");
if (marketing) {
  WARN(`${marketing} of the ${usedRoles.length} templates this flow sends are MARKETING — ` +
    `these are the ones Meta drops first when the number is quality-restricted`);
} else ok("every template this flow sends is UTILITY");

console.log(
  `\n${need ? `✗ ${need} BLOCKER(S)` : "✓ nothing missing"}` +
  `${warn ? ` · ${warn} warning(s)` : ""}\n`,
);
process.exit(need ? 1 : 0);
