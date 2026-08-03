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

// ── 1. Legacy sheet must be byte-identical to the old constants ──────────────
console.log("\nLEGACY SHEET (no campaign rows) — must match pre-refactor behaviour");
process.env.SHEET_ID = BTB;
const legacy = await loadCampaign();
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
check("not ended", hasEnded(hr) === false);

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

console.log(`\n${failures ? `✗ ${failures} CHECK(S) FAILED` : "✓ all checks passed"}\n`);
process.exit(failures ? 1 : 0);
