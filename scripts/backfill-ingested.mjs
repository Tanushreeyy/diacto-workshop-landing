// Mark the form rows that ALREADY EXIST as ingested, without sending anything.
//
//   node scripts/backfill-ingested.mjs <sheetId> --form-tab <tab> [--env-file .env.production] [--dry]
//
// Why this has to run before the first tick on an existing campaign:
//
// Ingest decides what is new by diffing the form tab against the automation tab
// (`knownIds` on lead_id, then `knownPhones`). On a sheet Meta has been filling
// for weeks, the automation tab is empty — so EVERY historical row reads as new
// and gets the acknowledgement. On the CandidHR sheet that is 84 people, most of
// them already called by the BDA team, receiving "thanks for your interest" days
// or weeks after they enquired.
//
// That is the same shape as the backlog that messaged people at 22:39 (see
// `fix(tick): ingest respected no quiet hours`), and quiet hours would not save
// us here: the lead_capture acknowledgement is transactional, so it is sent
// immediately and is exempt from both the quiet-hours defer and the promo cap.
// Nothing downstream will stop it. It has to be stopped here.
//
// So: write the history in as rows that are already done. Ingest then skips them
// on the first tick and every tick after, and only genuinely new leads are
// messaged. No WhatsApp, no email, no Slack — this script only appends rows.
//
// Idempotent: rows already present (by lead id or phone) are left alone, so a
// re-run after more leads arrive backfills only the gap.

import { readFileSync } from "fs";
import { JWT } from "google-auth-library";

const args = process.argv.slice(2);
const sheetId = args.find((a) => !a.startsWith("--"));
const dry = args.includes("--dry");
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const formTab = arg("form-tab", "");
const autoTab = arg("automation-tab", "automation");
const envPath = arg("env-file", ".env.production");

if (!sheetId || !formTab) {
  console.error(
    "Usage: node scripts/backfill-ingested.mjs <sheetId> --form-tab <tab> " +
      "[--automation-tab automation] [--env-file .env.production] [--dry]",
  );
  process.exit(1);
}

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// Header aliases, parsed from service.ts's FORM map rather than retyped — the
// same reasoning init-campaign-sheet.mjs gives for deriving the automation
// header from `A`. Two hand-kept copies would drift, and the drift would show up
// as a backfill that silently missed rows the tick then messaged.
const src = readFileSync("lib/booking/service.ts", "utf8");
const formBody = src.slice(src.indexOf("export const FORM = {"), src.indexOf("\n};", src.indexOf("export const FORM = {")));
const FORM = {};
for (const m of formBody.matchAll(/^  (\w+): \[([\s\S]*?)\],$/gm)) {
  FORM[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
const autoBody = src.slice(src.indexOf("const A = {"), src.indexOf("} as const;", src.indexOf("const A = {")));
const A = Object.fromEntries([...autoBody.matchAll(/^\s*(\w+):\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
if (!FORM.id || !A.leadId) {
  console.error("Refusing to run: could not parse FORM/A out of lib/booking/service.ts.");
  process.exit(1);
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const digits = (s) => String(s || "").replace(/\D/g, "");
// Same last-10 comparison the app's phoneKey uses, so a number stored as
// 9168011515 here and +919168011515 in the form is ONE person, not two.
const phoneKey = (s) => (digits(s).length >= 10 ? digits(s).slice(-10) : "");

const jwt = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const API = "https://sheets.googleapis.com/v4/spreadsheets";

async function read(tab) {
  let r;
  try {
    r = await jwt.request({ url: `${API}/${sheetId}/values/${encodeURIComponent(tab)}!A1:AZ` });
  } catch (e) {
    // "Unable to parse range" is what Sheets returns for a tab that does not
    // exist. Say so plainly — the raw stack trace reads like a credentials
    // problem and sends you looking in the wrong place.
    const msg = String(e?.response?.data?.error?.message || e.message || e);
    if (/Unable to parse range/i.test(msg)) {
      console.error(`No tab named '${tab}' in this spreadsheet.`);
      if (tab === autoTab) {
        console.error(`Create it first:  node scripts/init-campaign-sheet.mjs ${sheetId} --flow lead_capture`);
      }
      process.exit(1);
    }
    throw e;
  }
  const values = r.data.values ?? [];
  return { header: values[0] ?? [], rows: values.slice(1) };
}
const col = (header, cands) => {
  const map = new Map(header.map((h, i) => [norm(h), i]));
  for (const c of cands) if (map.has(norm(c))) return map.get(norm(c));
  return -1;
};

const form = await read(formTab);
const auto = await read(autoTab);
if (!auto.header.length) {
  console.error(
    `The '${autoTab}' tab has no header. Run init-campaign-sheet.mjs first — ` +
      `appending into a headerless tab would produce unreadable rows.`,
  );
  process.exit(1);
}

const idx = {};
for (const [k, cands] of Object.entries(FORM)) idx[k] = col(form.header, cands);
const get = (row, k) => (idx[k] >= 0 ? String(row[idx[k]] ?? "").trim() : "");

const missing = ["id", "name", "phone", "email", "company", "authority", "timeline", "screeningTool"]
  .filter((k) => idx[k] < 0);
if (missing.length) {
  console.warn(`! form columns not resolved (will be blank): ${missing.join(", ")}`);
}

const aLead = col(auto.header, [A.leadId]);
const aPhoneKey = col(auto.header, [A.phoneKey]);
const knownIds = new Set(auto.rows.map((r) => String(r[aLead] ?? "").trim()).filter(Boolean));
const knownPhones = new Set(
  auto.rows.map((r) => String(r[aPhoneKey] ?? "").trim()).filter(Boolean),
);

const nowIso = new Date().toISOString();
const istDay = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

const append = [];
let skipped = 0;
for (const row of form.rows) {
  if (!row.some((c) => String(c).trim())) continue;
  const leadId = get(row, "id");
  const phone = get(row, "phone");
  const email = get(row, "email");
  if (!leadId || (!email && !phone)) continue;
  const pk = phoneKey(phone);
  if (knownIds.has(leadId) || (pk && knownPhones.has(pk))) {
    skipped++;
    continue;
  }
  knownIds.add(leadId);
  if (pk) knownPhones.add(pk);

  // Values are written EXACTLY as Meta wrote them, un-prettified, unlike a live
  // ingest. These rows exist only to be matched on lead_id and phone so the tick
  // skips them; nothing is ever sent from them and no human call list is built
  // off them, so re-formatting history would be churn without a reader.
  //
  // registration_complete=TRUE and promo_today=0 are what make this row inert:
  // done rows are never nurtured, and the count means no promotional budget was
  // spent on somebody we deliberately did not message. registered_at stays blank
  // because they never registered for anything — this is a lead, not a signup,
  // and stamping a time we invented would lie to whoever reads the sheet.
  const values = {
    [A.leadId]: leadId,
    [A.source]: `backfill:${formTab}`,
    [A.createdAt]: nowIso,
    [A.name]: get(row, "name"),
    [A.designation]: get(row, "designation"),
    [A.company]: get(row, "company"),
    [A.location]: get(row, "location"),
    [A.employeeCount]: get(row, "employeeCount"),
    [A.years]: get(row, "years"),
    [A.authority]: get(row, "authority"),
    [A.timeline]: get(row, "timeline"),
    [A.screeningTool]: get(row, "screeningTool"),
    [A.phone]: phone,
    [A.phoneKey]: pk,
    [A.email]: email,
    [A.done]: "TRUE",
    [A.promoToday]: "0",
    [A.promoDay]: istDay,
    [A.status]: "backfilled",
    [A.statusAt]: nowIso,
    [A.statusSource]: "backfill-ingested",
  };
  // Written positionally against the LIVE header, so a column this script does
  // not know about stays empty rather than shifting every value one to the left.
  append.push(auto.header.map((h) => values[h] ?? ""));
}

console.log(`form tab '${formTab}':      ${form.rows.length} rows`);
console.log(`automation '${autoTab}':   ${auto.rows.length} rows already present`);
console.log(`already known (skipped):  ${skipped}`);
console.log(`to backfill as done:      ${append.length}`);
if (!append.length) {
  console.log("\nNothing to do — every form row is already accounted for.");
  process.exit(0);
}
console.log("\nSample:");
for (const r of append.slice(0, 3)) {
  console.log("  " + auto.header.map((h, i) => (r[i] ? `${h}=${r[i]}` : "")).filter(Boolean).join(" · "));
}

if (dry) {
  console.log(`\n[dry] Would append ${append.length} rows. Nothing written, nothing sent.`);
  process.exit(0);
}
await jwt.request({
  url: `${API}/${sheetId}/values/${encodeURIComponent(autoTab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
  method: "POST",
  data: { values: append },
});
console.log(`\nAppended ${append.length} rows as already-done. The next tick will skip them.`);
