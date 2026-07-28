// READ-ONLY. Lists live WATI templates + approval status and checks the ones
// the Saturday (Business Transformation Blueprint) workshop depends on.
// Sends NOTHING. Run: node scripts/check-wa-live.mjs [path-to-env]
import { readFileSync } from "fs";

const envPath = process.argv[2] || ".env.local";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const endpoint = (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const token = process.env.WATI_ACCESS_TOKEN || "";
if (!endpoint || !token) { console.error("Missing WATI_API_ENDPOINT / WATI_ACCESS_TOKEN"); process.exit(1); }

// The templates this workshop needs live. BTB = new positioning; the plain
// names are the ones config.ts currently points at by default.
const NEEDED = {
  "wa_1_btb_booking_pending": "WA-1 booking pending (BTB)",
  "wa_2_btb_value_nudge": "WA-2 value nudge (BTB)",
  "wa_3_btb_problem_nudge": "WA-3 problem nudge (BTB)",
  "wa_4_btb_urgency_nudge": "WA-4 urgency nudge (BTB)",
  "wa_5_btb_confirmation": "WA-5 confirmation + pass (BTB)",
  "wa_6_btb_day_before": "WA-6 day before (BTB)",
  "wa_7_btb_morning_of": "WA-7 morning of (BTB)",
  "wa_8_btb_two_hour_v3": "WA-8 two hours before (BTB)",
  "wa_lead_alert": "lead alert (2-var safeproof)",
  "wa_lead_alert_full": "lead alert (7-var full)",
};

const all = new Map();
let page = 1;
while (true) {
  const url = `${endpoint}/api/v1/getMessageTemplates?pageSize=100&pageNumber=${page}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { console.error(`WATI list failed: ${r.status} ${await r.text()}`); process.exit(1); }
  const j = await r.json();
  const items = j.messageTemplates || j.result || j.data || [];
  for (const t of items) all.set(t.elementName || t.templateName || t.name, t);
  if (items.length < 100) break;
  page++;
  if (page > 20) break;
}

const norm = (s) => (s || "").toString().toUpperCase();
console.log(`\nLive templates on WATI (${endpoint.split("/").pop()}): ${all.size} total\n`);

console.log("=== Templates this workshop needs ===");
let missing = 0, notApproved = 0;
for (const [name, label] of Object.entries(NEEDED)) {
  const t = all.get(name);
  if (!t) { console.log(`  ✗ MISSING   ${name}  — ${label}`); missing++; continue; }
  const status = norm(t.status || t.templateStatus);
  const cat = t.category || t.templateCategory || "?";
  const ok = status === "APPROVED";
  if (!ok) notApproved++;
  console.log(`  ${ok ? "✓" : "…"} ${status.padEnd(9)} ${name}  [${cat}]  — ${label}`);
}

console.log("\n=== All BTB / lead_alert templates seen live (any status) ===");
for (const [name, t] of [...all.entries()].sort()) {
  if (/btb|lead_alert|two_hour/i.test(name)) {
    console.log(`  ${norm(t.status || t.templateStatus).padEnd(9)} ${name}  [${t.category || "?"}]`);
  }
}

console.log(`\nSummary: ${Object.keys(NEEDED).length - missing - notApproved} approved, ${notApproved} pending/other, ${missing} missing.`);
