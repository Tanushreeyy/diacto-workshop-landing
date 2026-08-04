// Create/submit the campaign-aware internal ops lead alert.
//
//   node scripts/create-wa-lead-alert.mjs --dry
//   node scripts/create-wa-lead-alert.mjs --env-file .env.production
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A NEW TEMPLATE RATHER THAN AN EDIT
//
// An approved template's body cannot be changed, and its category can never be
// changed at all. The two existing ops alerts both open with the literal words
// "A new Business Transformation Blueprint lead just came in" — so every HR lead
// alert has been naming the wrong workshop.
//
// That was survivable while one campaign ran at a time. From the moment both run
// in parallel it is not: they alert the SAME ops number, and the two need
// opposite calls — the founder workshop is self_serve (chase them to book) while
// HR is sdr_assisted (confirm attendance). An SDR pitching "10X growth for
// founders" to an HR manager is a lead wasted and a bad impression made.
//
// So the campaign becomes {{1}}, and this template never needs replacing again
// when the next workshop starts.
// ─────────────────────────────────────────────────────────────────────────────
//
// UTILITY, like the two it replaces. This is an internal operational
// notification about a lead that already exists — there is nothing promotional
// in it, and UTILITY is what keeps delivering when Meta quality-restricts the
// number (measured 1 Aug: UTILITY 30/30, MARKETING 11/36).
//
// The variable ORDER here must match leadAlertFields("...campaign...") in
// lib/booking/config.ts exactly. That function is what builds the params at send
// time and what the pre-flight check counts against; if the two ever drift, WATI
// rejects the whole send and ops silently stops hearing about new leads.

import { readFileSync } from "fs";

const LANG = process.env.META_TEMPLATE_LANG || "en_US";
const FOOTER = "Diacto Technologies";

const watiEndpoint = () => (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const watiToken = () => process.env.WATI_ACCESS_TOKEN || "";

// Order: campaign · name · phone · email · company · designation · team size ·
// location · years. Identity first, then the qualifiers an SDR reads out.
//
// `years` is blank on the HR form and `company` was absent from the older
// founder form — both render as "—" rather than being omitted, because a
// template send with an empty body param is rejected outright by Meta.
const TEMPLATE = {
  name: "wa_lead_alert_campaign",
  category: "UTILITY",
  header: "New workshop lead",
  body:
    "🔔 New {{1}} lead\n\n" +
    "Name: {{2}}\n" +
    "Phone: {{3}}\n" +
    "Email: {{4}}\n" +
    "Company: {{5}}\n" +
    "Designation: {{6}}\n" +
    "Team size: {{7}}\n" +
    "Location: {{8}}\n" +
    "Years in business: {{9}}\n\n" +
    "Please follow up to confirm their seat.",
  example: [
    "HR Workshop — 12 Aug 2026",
    "Priya Sharma",
    "+919876543210",
    "priya@example.com",
    "Acme Pvt Ltd",
    "HR Manager",
    "21-100",
    "Pune",
    "—",
  ],
};

function watiPayload(t) {
  return {
    type: "template",
    elementName: t.name,
    category: t.category,
    subCategory: "STANDARD",
    language: LANG,
    header: { type: "TEXT", text: t.header },
    body: t.body,
    footer: FOOTER,
    customParams: t.example.map((value, i) => ({ paramName: String(i + 1), paramValue: value })),
    creationMethod: 0,
  };
}

async function createViaWati(t) {
  const token = watiToken();
  const res = await fetch(`${watiEndpoint()}/api/v1/whatsApp/templates`, {
    method: "POST",
    headers: {
      Authorization: token.startsWith("Bearer") ? token : `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(watiPayload(t)),
  });
  const data = await res.json().catch(() => ({}));
  const failed = data?.ok === false || data?.result === false;
  if (res.ok && !failed) return `status=${data.status || data.templateStatus || "PENDING"}`;
  throw new Error(`${res.status}: ${data?.message || data?.info || JSON.stringify(data).slice(0, 300)}`);
}

async function main() {
  const dry = process.argv.includes("--dry");
  const efIdx = process.argv.indexOf("--env-file");
  if (efIdx >= 0 && process.argv[efIdx + 1]) {
    for (const m of readFileSync(process.argv[efIdx + 1], "utf8").matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }

  const t = TEMPLATE;
  const b = t.body.trim();
  // The same local compliance guards the campaign scripts use, so a bad edit can
  // never reach Meta and burn a name (a rejected name cannot be resubmitted).
  if (/^\{\{\d+\}\}/.test(b)) throw new Error("body STARTS with a variable");
  if (/\{\{\d+\}\}$/.test(b)) throw new Error("body ENDS with a variable");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(b)) throw new Error("two adjacent variables");
  if (b.length > 1024) throw new Error(`body is ${b.length} chars, Meta's limit is 1024`);
  if (t.header.length > 60) throw new Error(`header is ${t.header.length} chars, limit is 60`);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.header)) throw new Error("header contains an emoji — WATI rejects these");
  if (t.category !== "UTILITY") throw new Error("must be UTILITY — see the header comment");

  const vars = new Set([...b.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
  const expected = [...Array(t.example.length)].map((_, i) => i + 1);
  if (vars.size !== t.example.length || !expected.every((n) => vars.has(n))) {
    throw new Error(`body uses ${vars.size} variable(s) but ${t.example.length} example value(s) were given`);
  }

  console.log(`${t.name}  [${t.category}]  ${vars.size} variables\n`);
  console.log(t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => t.example[n - 1]));
  console.log(`\n— ${FOOTER}\n`);

  if (dry) {
    console.log("DRY RUN — nothing submitted.");
    return;
  }
  if (!watiEndpoint() || !watiToken()) throw new Error("WATI_API_ENDPOINT / WATI_ACCESS_TOKEN missing");
  console.log(`submitting… ${await createViaWati(t)}`);
  console.log(
    "\nMeta review is usually minutes, occasionally hours. Check with:\n" +
      "  npx tsx scripts/necessity-check.mts\n" +
      "Once APPROVED, set tpl_wa_lead_alert = wa_lead_alert_campaign in EACH\n" +
      "campaign's control tab. No deploy — it takes effect on the next tick.",
  );
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
