// Verification for the Phase 0 campaign refactor. READ-ONLY, sends nothing.
//
// Checks the claim the whole refactor rests on: a sheet with NO campaign rows
// behaves exactly as it did before, while a sheet WITH them drives everything
// from the control tab.
//
//   npx tsx scripts/verify-campaign.mts

import { readFileSync } from "fs";
for (const line of readFileSync(".env.production", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { loadCampaign, campaignProblems, hasEnded } = await import("../lib/booking/campaign.js");
const { WORKSHOP, WA_TEMPLATES, REMINDERS } = await import("../lib/booking/config.js");
const { waParamsFor } = await import("../lib/booking/messages.js");
const { dueReminders } = await import("../lib/booking/schedule.js");

// Both sheets are named outright. BTB used to come from process.env.SHEET_ID,
// which was true only while production still pointed at it — the moment SHEET_ID
// flipped to HR the "legacy" section started loading HR and failing six checks
// that were never about HR. A regression test must not move with the thing it
// is testing.
const BTB = "1qt-4O2Z0XiUetYitGd4aAVr60FPnH5XKgG1nhMT5IZ8"; // Business Transformation Blueprint, 1 Aug 2026
const HR = "15UVNp073mXm97FEADXdt0o3re4YNpu9-2YsxMF39Ky8"; // HR Workshop, 12 Aug 2026
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const ctx = {
  firstName: "Priya",
  bookingLink: "https://x/?rid=T",
  passUrl: "https://x/api/pass?rid=T",
  dateLabel: "D", dateShort: "SHORT", timeLabel: "T", venue: "V", mapUrl: "M", support: "S",
};

// ── 1. A sheet with NO campaign rows must still behave exactly as before ─────
//
// This used to point at the BTB sheet's `control` tab, which had no campaign
// rows. It has them now — the founder workshop became a managed campaign on
// 4 Aug — so the guarantee has to be tested somewhere that is still unmanaged.
// `control_staging` is that place: same spreadsheet, switches only, no campaign
// rows. Testing it here keeps the backwards-compatibility promise honest
// without needing a live campaign to stay unconfigured forever.
console.log("\nUNMANAGED SHEET (no campaign rows) — must match pre-refactor behaviour");
process.env.SHEET_ID = BTB;
const prevControlTab = process.env.SHEET_CONTROL_TAB;
process.env.SHEET_CONTROL_TAB = "control_staging";
const legacy = await loadCampaign();
process.env.SHEET_CONTROL_TAB = prevControlTab;
check("date/venue/start/prefix match config.ts",
  legacy.event.dateShort === WORKSHOP.dateShort &&
  legacy.event.venue === WORKSHOP.venue &&
  legacy.event.startUtc === WORKSHOP.eventStartUtc &&
  legacy.event.regIdPrefix === WORKSHOP.regIdPrefix);
check("MMDD derived from start == old EVENT_MMDD",
  legacy.event.mmdd === WORKSHOP.eventMMDD,
  `${legacy.event.mmdd} vs ${WORKSHOP.eventMMDD}`);
check("template names match WA_TEMPLATES",
  legacy.templates.wa1 === WA_TEMPLATES.WA1 &&
  legacy.templates.wa5 === WA_TEMPLATES.WA5 &&
  legacy.templates.wa8 === WA_TEMPLATES.WA8);
check("reminder schedule identical to REMINDERS",
  JSON.stringify(legacy.reminders) === JSON.stringify(REMINDERS));
check("flow defaults to self_serve", legacy.flow === "self_serve");
check("not managed (falls back to env/config)", legacy.managed === false);
check("validates clean", campaignProblems(legacy).length === 0);

// ── 1b. The FOUNDER campaign, now managed from its own control tab ──────────
console.log("\nFOUNDER SHEET (managed) — Business Transformation Blueprint");
process.env.SHEET_ID = BTB;
const fnd = await loadCampaign();
check("flow is self_serve", fnd.flow === "self_serve", fnd.flow);
check("managed", fnd.managed === true);
check("reg prefix HPT (matches the 83 rows already issued)",
  fnd.event.regIdPrefix === "HPT", fnd.event.regIdPrefix);
check("event is Sat 8 Aug 2026, 15:00 IST",
  fnd.event.startUtc === "2026-08-08T09:30:00Z", fnd.event.startUtc);
check("MMDD 0808 from start", fnd.event.mmdd === "0808", fnd.event.mmdd);
check("uses BTB templates, not the HR campaign's",
  fnd.templates.wa5.includes("_btb_") && !fnd.templates.wa8.includes("_hr_"),
  `${fnd.templates.wa5} / ${fnd.templates.wa8}`);
check("two-hour template is the approved v3, not the generic fallback",
  fnd.templates.wa8 === "wa_8_btb_two_hour_v3", fnd.templates.wa8);
// A moment safely BEFORE a campaign's event, derived from the campaign itself.
//
// The "not ended" checks below used to call hasEnded(c) with no `now`, so they
// asked "is this workshop over as of the instant the test runs?". That is a
// question about the calendar, not about the code: both assertions passed while
// the workshops were upcoming and began failing the day they happened, reporting
// a red check for behaviour that was perfectly correct.
//
// Anchoring `now` to the campaign's own start keeps the assertion meaningful for
// good, and keeps it honest if the control tab's date is ever changed.
const beforeEvent = (c: { event: { startMs: number } }) => c.event.startMs - 86_400_000;
const afterEvent = (c: { event: { startMs: number } }) => c.event.startMs + 86_400_000;

check("validates clean", campaignProblems(fnd).length === 0, campaignProblems(fnd).join("; "));
check("not ended the day before it runs", hasEnded(fnd, beforeEvent(fnd)) === false);
check("ended the day after it runs", hasEnded(fnd, afterEvent(fnd)) === true);

// ── 2. Variable mapping must be unchanged by the role refactor ───────────────
// Old logic keyed off template NAME; new logic keys off role. Same output.
console.log("\nWHATSAPP VARIABLE MAPPING (role-based == old name-based)");
const oldWay = (tplName: string) => {
  const T = WA_TEMPLATES;
  const pre = [T.WA1, T.WA2, T.WA3, T.WA4].includes(tplName);
  const link = pre ? ctx.bookingLink : ctx.passUrl;
  const carries = [T.WA1, T.WA2, T.WA3, T.WA4, T.WA5].includes(tplName);
  return carries
    ? [{ name: "1", value: ctx.firstName }, { name: "2", value: ctx.dateShort }, { name: "3", value: link }]
    : [{ name: "1", value: ctx.firstName }, { name: "2", value: link }];
};
for (const [role, tpl] of [
  ["wa1", WA_TEMPLATES.WA1], ["wa2", WA_TEMPLATES.WA2], ["wa3", WA_TEMPLATES.WA3],
  ["wa4", WA_TEMPLATES.WA4], ["wa5", WA_TEMPLATES.WA5], ["wa6", WA_TEMPLATES.WA6],
  ["wa7", WA_TEMPLATES.WA7], ["wa8", WA_TEMPLATES.WA8],
] as const) {
  const now = JSON.stringify(waParamsFor(role, ctx as any));
  check(`${role} (${tpl})`, now === JSON.stringify(oldWay(tpl)), now);
}

// ── 3. HR campaign drives everything from the control tab ───────────────────
console.log("\nHR SHEET (campaign rows set)");
process.env.SHEET_ID = HR;
const hr = await loadCampaign();
check("flow is sdr_assisted", hr.flow === "sdr_assisted", hr.flow);
check("managed", hr.managed === true);
check("reg prefix HRW", hr.event.regIdPrefix === "HRW");
check("MMDD 0812 from start", hr.event.mmdd === "0812", hr.event.mmdd);
check("uses HR templates, not the previous campaign's",
  hr.templates.wa5.includes("_hr_") && hr.templates.wa8.includes("_hr_"),
  `${hr.templates.wa5} / ${hr.templates.wa8}`);
check("validates clean", campaignProblems(hr).length === 0, campaignProblems(hr).join("; "));
check("not ended the day before it runs", hasEnded(hr, beforeEvent(hr)) === false);
check("ended the day after it runs", hasEnded(hr, afterEvent(hr)) === true);

// Reminders fire at the right IST wall-clock times.
const ist = (iso: string) =>
  new Date(Date.parse(iso) + (5 * 60 + 30) * 60000).toISOString().slice(0, 16).replace("T", " ");
const times = hr.reminders.filter((r) => r.kind === "wa").map((r) => `${r.key} ${ist(r.at)}`);
check("reminder wall-clock (IST)",
  times.join(" | ") === "WA6 2026-08-11 10:00 | WA7 2026-08-12 09:00 | WA8 2026-08-12 13:00",
  times.join(" | "));

// dueReminders honours the campaign's own schedule and start.
const dayBefore = new Date(Date.parse("2026-08-11T05:00:00Z")); // 10:30 IST, 11 Aug
const due = dueReminders("", hr.reminders, hr.event.startMs, dayBefore);
check("day-before reminders due at 10:30 IST on 11 Aug",
  due.map((r) => r.key).sort().join(",") === "EM6,WA6", due.map((r) => r.key).join(","));
const afterStart = new Date(Date.parse("2026-08-12T10:00:00Z")); // workshop underway
check("nothing fires once the workshop has started",
  dueReminders("", hr.reminders, hr.event.startMs, afterStart).length === 0);

// A managed campaign must never inherit the previous campaign's template.
const bleed = { ...hr, templates: { ...hr.templates, wa8: "" } };
check("blank template on managed campaign is rejected",
  campaignProblems(bleed as any).some((p) => p.includes("tpl_wa_two_hour")));

// ── lead_capture — the flow with no event ───────────────────────────────────
//
// Built in-process rather than loaded from a sheet: these are claims about the
// FLOW, not about anyone's control tab, and every one of them is a way this
// campaign could fail while looking configured and healthy.
console.log("\nLEAD_CAPTURE (CandidHR) — no event, one acknowledgement");
const lead: any = {
  ...hr,
  flow: "lead_capture",
  label: "CandidHR Lead Gen",
  reminders: [],
  demoVideoUrl: "https://www.youtube.com/watch?v=QycFhOi96LA",
  templates: { ...hr.templates, leadFollowup: "wa_candidhr_lead_followup" },
};

// The one that would have bitten hardest. A lead_capture sheet leaves
// event_start_utc blank, so it inherits a workshop date that has already passed
// — and the auto-stop is SILENT, so the campaign would ingest nothing, say
// nothing, and look fine.
// Checked at a moment well past the inherited date, not at "now" — otherwise
// this passes for the wrong reason on any day the inherited date is still in
// the future, and only starts testing anything once it has gone by.
check("never auto-stops, despite inheriting a past event date",
  hasEnded(lead, afterEvent(lead)) === false, `startUtc ${lead.event.startUtc}`);

check("valid with a template and a demo link", campaignProblems(lead).length === 0,
  campaignProblems(lead).join(" | "));

// Event fields are meaningless here and must not be demanded. Blanking all of
// them is exactly what a real lead_capture control tab looks like.
const noEvent = { ...lead, event: { ...lead.event, dateShort: "", dateLabel: "", venue: "", regIdPrefix: "", startUtc: "", startMs: NaN } };
check("blank event fields are not an error on this flow",
  campaignProblems(noEvent).length === 0, campaignProblems(noEvent).join(" | "));

// …but its own two requirements are.
check("blank tpl_wa_lead_followup is rejected",
  campaignProblems({ ...lead, templates: { ...lead.templates, leadFollowup: "" } })
    .some((p) => p.includes("tpl_wa_lead_followup")));
check("blank demo_video_url is rejected",
  campaignProblems({ ...lead, demoVideoUrl: "" }).some((p) => p.includes("demo_video_url")));

// {{1}} name · {{2}} demo link. No date, no pass — the two things a workshop
// template carries and this one must not.
const leadParams = waParamsFor("lead", { ...ctx, demoVideoUrl: lead.demoVideoUrl } as any);
check("WA params are name + demo link",
  leadParams.length === 2 &&
  leadParams[0].value === "Priya" &&
  leadParams[1].value === lead.demoVideoUrl,
  leadParams.map((p: any) => `${p.name}=${p.value}`).join(" "));
check("no reminders are ever due", dueReminders("", lead.reminders, NaN).length === 0);

console.log(`\n${failures ? `✗ ${failures} CHECK(S) FAILED` : "✓ all checks passed"}\n`);
process.exit(failures ? 1 : 0);
