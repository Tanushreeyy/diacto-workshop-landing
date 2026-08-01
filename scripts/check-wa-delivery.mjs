// READ-ONLY. Names the people whose WhatsApp messages Meta refused.
//
// The on-demand counterpart to lib/booking/delivery.ts. That module does the same
// job inside the tick, but it is opt-in and OFF by default (it costs ~26 WATI read
// calls per tick, which tripped a 429 during a live blast — see commit 5fbaf5f).
// So when the question is "did today's reminders actually land?", this answers it
// without turning polling on for every tick.
//
// Sends NOTHING. Every request is a GET.
//
//   node scripts/check-wa-delivery.mjs [path-to-env] [--since YYYY-MM-DD] [--contacts N]

import { readFileSync } from "fs";
import { JWT } from "google-auth-library";

const args = process.argv.slice(2);
const envPath = args.find((a) => !a.startsWith("--")) || ".env.production";
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const ep = (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const rawToken = process.env.WATI_ACCESS_TOKEN || "";
const auth = rawToken.startsWith("Bearer") ? rawToken : `Bearer ${rawToken}`;
if (!ep || !rawToken) {
  console.error("Missing WATI_API_ENDPOINT / WATI_ACCESS_TOKEN");
  process.exit(1);
}

const MAX_CONTACTS = parseInt(flag("contacts", "80"), 10);
// Default: everything since midnight UTC today.
const sinceRaw = flag("since", new Date().toISOString().slice(0, 10));
const since = Date.parse(`${sinceRaw}T00:00:00Z`);

const get = async (p) => {
  const r = await fetch(`${ep}${p}`, { headers: { Authorization: auth }, cache: "no-store" });
  return r.ok ? r.json() : null;
};

// ---- WATI: every outbound failure in the window, keyed by last-10 digits ----
const contacts = await get(`/api/v1/getContacts?pageSize=${MAX_CONTACTS}&pageNumber=1`);
if (!contacts) {
  console.error("getContacts failed — token lacks contacts:read, or WATI is rate-limiting.");
  process.exit(1);
}

const failedByKey = new Map();
const tally = { SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0 };
const perTemplate = {};

for (const c of contacts.contact_list ?? []) {
  const msgs = await get(`/api/v1/getMessages/${encodeURIComponent(c.wAid)}?pageSize=15&pageNumber=1`);
  for (const it of msgs?.messages?.items ?? []) {
    if (it.owner === false) continue; // inbound
    if (!it.created || Date.parse(it.created) < since) continue;
    const status = (it.statusString || "").toUpperCase();
    // WATI reports the template name only inside the human-readable description.
    const tpl = (it.eventDescription || "").match(/"([^"]+)"/)?.[1] || it.templateId || "?";
    perTemplate[tpl] ??= { ok: 0, fail: 0 };
    if (status in tally) tally[status]++;
    if (status === "FAILED") {
      perTemplate[tpl].fail++;
      const key = String(c.phone || c.wAid).replace(/\D/g, "").slice(-10);
      if (!failedByKey.has(key)) failedByKey.set(key, []);
      failedByKey.get(key).push({ tpl, at: it.created, why: it.failedDetail || "" });
    } else {
      perTemplate[tpl].ok++;
    }
  }
}

// ---- Sheet: turn phone keys into people ----
const jwt = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const tab = process.env.SHEET_AUTOMATION_TAB;
const res = await jwt.request({
  url: `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SHEET_ID}/values/${encodeURIComponent(tab)}!A1:AZ`,
});
const values = res.data.values ?? [];
const header = values[0] ?? [];
const at = (row, name) => {
  const i = header.indexOf(name);
  return i === -1 ? "" : row[i] ?? "";
};

const registered = [];
const others = [];
for (const row of values.slice(1)) {
  const key = String(at(row, "phone_key")).replace(/\D/g, "").slice(-10);
  if (!key || !failedByKey.has(key)) continue;
  const fails = failedByKey.get(key);
  const rec = {
    name: at(row, "name") || "(no name)",
    phone: at(row, "phone") || key,
    email: at(row, "email"),
    status: at(row, "status"),
    reminders: at(row, "reminders_sent"),
    templates: [...new Set(fails.map((f) => f.tpl))].join(", "),
    why: (fails[0].why || "").slice(0, 80),
  };
  const isDone = String(at(row, "registration_complete")).trim().toUpperCase() === "TRUE";
  (isDone ? registered : others).push(rec);
}

const total = tally.SENT + tally.DELIVERED + tally.READ + tally.FAILED;
const pct = total ? ((tally.FAILED / total) * 100).toFixed(1) : "0.0";

console.log(`\nWhatsApp delivery since ${sinceRaw} — ${contacts.contact_list?.length ?? 0} contacts scanned`);
console.log("=".repeat(78));
console.log(`SENT ${tally.SENT} · DELIVERED ${tally.DELIVERED} · READ ${tally.READ} · FAILED ${tally.FAILED}`);
console.log(`FAILURE RATE: ${pct}%  (${tally.FAILED}/${total})\n`);

console.log("Per template:");
for (const [t, v] of Object.entries(perTemplate).sort((a, b) => b[1].fail - a[1].fail)) {
  console.log(`  ${String(t).padEnd(34)} ok=${String(v.ok).padEnd(4)} fail=${v.fail}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log(`REGISTERED ATTENDEES WHOSE MESSAGE FAILED  (${registered.length})`);
console.log("=".repeat(78));
if (!registered.length) console.log("  none — every registered attendee's message got through.");
for (const r of registered) {
  console.log(`  ${r.name.padEnd(26)} ${r.phone.padEnd(15)} ${r.templates}`);
  console.log(`      email: ${r.email || "—"}`);
  console.log(`      sheet records as sent: ${r.reminders || "—"}`);
  console.log(`      ${r.why}`);
}

console.log(`\n${"-".repeat(78)}`);
console.log(`Non-registered leads that also failed: ${others.length}`);
for (const r of others.slice(0, 15)) {
  console.log(`  ${r.name.padEnd(26)} ${r.phone.padEnd(15)} ${r.templates}`);
}
if (others.length > 15) console.log(`  … and ${others.length - 15} more`);
console.log();
