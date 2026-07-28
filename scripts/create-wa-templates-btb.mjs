// Create/submit the Business Transformation Blueprint (Sat 1 Aug) WhatsApp templates.
//
// Self-contained sibling of create-wa-templates.mjs. Differs because this campaign
// needs a PER-TEMPLATE header (the old script has one global HEADER) and because the
// two lead-alert templates carry NO "Get Directions" button and a different header.
//
// Variable contract is unchanged, so lib/booking/messages.ts -> waParamsFor needs no
// edit; once APPROVED, point WATI_TPL_WA1..8 at the wa_*_btb_* names.
//
//   node scripts/create-wa-templates-btb.mjs --dry            # print payloads, send nothing
//   node scripts/create-wa-templates-btb.mjs --env-file .env.production          # submit all
//   node scripts/create-wa-templates-btb.mjs --env-file .env.production --only alert
//
// VENUE: "Baner" (map pin + every existing template). "Buner" in Slack is a typo.

import { readFileSync } from "fs";

const LANG = process.env.META_TEMPLATE_LANG || "en_US";
const FOOTER = "Diacto Technologies";
const SUPPORT = "+91 7387731069";
const MAP_URL = "https://maps.app.goo.gl/MtpixrnbfgNFHYku5";
const BUTTON = { type: "URL", text: "Get Directions", url: MAP_URL };

const HDR = "BUSINESS TRANSFORMATION BLUEPRINT"; // marketing/ladder header (no emoji)
const HDR_ALERT = "NEW WORKSHOP LEAD";           // internal lead-alert header (no emoji)

const watiEndpoint = () => (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const watiToken = () => process.env.WATI_ACCESS_TOKEN || "";

const EX_NAME = "Priya";
const EX_DATE = "Sat, 1 August";
const EX_LINK = "https://diacto-workshop.example.com/?rid=abc123";
const EX_PASS = "https://diacto-workshop.example.com/api/pass?rid=abc123";

// name, category, header, whether it has the Get Directions button, ordered sample
// values, and body. Every body: opens on text (never a variable), never ends on a
// variable, never has two adjacent variables, header is plain text (no emoji).
export const TEMPLATES = [
  { name: "wa_1_btb_booking_pending", category: "MARKETING", header: HDR, button: true, example: [EX_NAME, EX_DATE, EX_LINK],
    body:
      "Hi {{1}} 👋 Thanks for your interest in the Business Transformation Blueprint Workshop — FREE, exclusively for Founders & Entrepreneurs. Achieve 10X business growth in just 1 year.\n\n" +
      "🗓 {{2}}  |  🕒 3–6 PM  |  📍 901, B Wing, Prabhavee Tech Park, Baner, Pune\n\n" +
      "⚠️ Your seat is not confirmed yet. Book in 30 seconds here: {{3}}\n\n" +
      "Tap “Get Directions” below for the venue map. See you there! 🚀" },

  { name: "wa_2_btb_value_nudge", category: "MARKETING", header: HDR, button: true, example: [EX_NAME, EX_DATE, EX_LINK],
    body:
      "Hi {{1}}, your seat for the Business Transformation Blueprint Workshop is still on hold. ⏳\n\n" +
      "In 3 hours you’ll get:\n" +
      "✅ The 3Ps of Business Growth — People, Process, Product\n" +
      "✅ The 8 Pillars of a Scalable Business\n" +
      "✅ How to build a high-performance team that doesn’t depend on you\n\n" +
      "🗓 {{2}}  |  3–6 PM  |  Baner, Pune  |  FREE\n\n" +
      "Confirm your seat here: {{3}}\n\n" +
      "Don’t miss it — seats are limited. 👇" },

  { name: "wa_3_btb_problem_nudge", category: "MARKETING", header: HDR, button: true, example: [EX_NAME, EX_DATE, EX_LINK],
    body:
      "Hey {{1}}, one question 👇\n" +
      "Could your business achieve its next 10 years of growth in just 1 year — or is something holding it back?\n\n" +
      "Most founders stay stuck in daily firefighting instead of scaling. The Business Transformation Blueprint shows you how to break out — with proven frameworks.\n\n" +
      "🗓 {{2}}  |  3–6 PM  |  Baner, Pune\n\n" +
      "Confirm your seat here: {{3}}\n\n" +
      "Reserve your spot before it’s gone. 🚀" },

  { name: "wa_4_btb_urgency_nudge", category: "MARKETING", header: HDR, button: true, example: [EX_NAME, EX_DATE, EX_LINK],
    body:
      "Hi {{1}}, seats are filling fast — your booking is still incomplete. ⏰\n\n" +
      "Business Transformation Blueprint — {{2}}  |  3–6 PM  |  Baner, Pune  |  FREE\n\n" +
      "Take 30 seconds to confirm here: {{3}}\n\n" +
      "Don’t let your seat be released. 👇" },

  { name: "wa_5_btb_confirmation", category: "UTILITY", header: HDR, button: true, example: [EX_NAME, EX_DATE, EX_PASS],
    body:
      "🎉 Congratulations {{1}}! Your seat for the Business Transformation Blueprint Workshop is CONFIRMED.\n\n" +
      "🗓 {{2}}  |  🕒 3–6 PM  |  📍 901, B Wing, Prabhavee Tech Park, Baner, Pune\n\n" +
      "📎 Your Event Pass: {{3}}\n\n" +
      "Also emailed to you — carry it (digital or print) for entry. Our team will call you shortly. Tap “Get Directions” below. 🚀" },

  { name: "wa_6_btb_day_before", category: "UTILITY", header: HDR, button: true, example: [EX_NAME, EX_PASS],
    body:
      "Hi {{1}}! Tomorrow at 3 PM — Business Transformation Blueprint Workshop, 901 B Wing, Prabhavee Tech Park, Baner.\n\n" +
      "📎 Your Event Pass: {{2}}\n\n" +
      "Check-in opens 2:30 PM. Tap “Get Directions” below. See you there! 🚀" },

  { name: "wa_7_btb_morning_of", category: "UTILITY", header: HDR, button: true, example: [EX_NAME, EX_PASS],
    body:
      "Good morning {{1}}! ☀️ The Business Transformation Blueprint Workshop is today at 3 PM — doors open 2:30 PM, 901 B Wing, Prabhavee Tech Park, Baner.\n\n" +
      "📎 Your Event Pass: {{2}}\n\n" +
      "Saturday traffic in Baner — leave early! Tap “Get Directions” below. ✅" },

  // Two rejections (UTILITY, with a "2 hours" countdown + phone number) taught the
  // lesson: the live APPROVED sibling `wa_two_hour` is MARKETING, plain and phone-free.
  // This mirrors that winning formula for the 2-hour slot.
  { name: "wa_8_btb_two_hour_v3", category: "MARKETING", header: HDR, button: true, example: [EX_NAME, EX_PASS],
    body:
      "Hi {{1}}! Just 2 hours to go — the Business Transformation Blueprint Workshop begins at 3 PM today, doors open 2:30 PM, 901 B Wing, Prabhavee Tech Park, Baner.\n\n" +
      "📎 Your Event Pass: {{2}}\n\n" +
      "Saturday traffic in Baner — leave now to be on time! Tap “Get Directions” below. ✅" },

  // ── Internal lead alerts (to the ops number). No button; different header. ──
  { name: "wa_lead_alert", category: "UTILITY", header: HDR_ALERT, button: false,
    example: ["Priya Sharma", "+91 98765 43210"],
    body:
      "🔔 A new Business Transformation Blueprint lead just came in.\n\n" +
      "Name: {{1}}\n" +
      "Phone: {{2}}\n\n" +
      "Please follow up to confirm their seat." },

  { name: "wa_lead_alert_full", category: "UTILITY", header: HDR_ALERT, button: false,
    example: ["Priya Sharma", "+91 98765 43210", "priya@acme.in", "Pune", "Founder / CEO", "3-10", "20-100"],
    body:
      "🔔 A new Business Transformation Blueprint lead just came in.\n\n" +
      "Name: {{1}}\n" +
      "Phone: {{2}}\n" +
      "Email: {{3}}\n" +
      "Location: {{4}}\n" +
      "Designation: {{5}}\n" +
      "Years in business: {{6}}\n" +
      "Team size: {{7}}\n\n" +
      "Please follow up to confirm their seat." },
];

function watiPayload(t) {
  const p = {
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
  if (t.button) {
    p.buttonsType = "call_to_action";
    p.buttons = [{ type: "url", parameter: { text: BUTTON.text, phoneNumber: "", url: BUTTON.url, urlType: "static" } }];
  }
  return p;
}

async function createViaWati(t) {
  const token = watiToken();
  const res = await fetch(`${watiEndpoint()}/api/v1/whatsApp/templates`, {
    method: "POST",
    headers: { Authorization: token.startsWith("Bearer") ? token : `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(watiPayload(t)),
  });
  const data = await res.json().catch(() => ({}));
  const failed = data?.ok === false || data?.result === false;
  if (res.ok && !failed) return `status=${data.status || data.templateStatus || "PENDING"}`;
  throw new Error(`${res.status}: ${data?.message || data?.info || JSON.stringify(data).slice(0, 300)}`);
}

function main() {
  const dry = process.argv.includes("--dry");
  const efIdx = process.argv.indexOf("--env-file");
  if (efIdx >= 0 && process.argv[efIdx + 1]) {
    const text = readFileSync(process.argv[efIdx + 1], "utf8");
    for (const m of text.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? (process.argv[onlyIdx + 1] || "") : "";
  let todo = TEMPLATES;
  if (only) todo = todo.filter((t) => t.name.includes(only));
  if (!todo.length) { console.error(`No template matches --only "${only}".`); process.exit(1); }

  // Local Meta-compliance guard so a bad edit can't reach Meta: body must not start
  // or end on a variable, and no two variables may be adjacent.
  for (const t of todo) {
    const b = t.body.trim();
    if (/^\{\{\d+\}\}/.test(b)) { console.error(`❌ ${t.name}: body STARTS with a variable`); process.exit(1); }
    if (/\{\{\d+\}\}$/.test(b)) { console.error(`❌ ${t.name}: body ENDS with a variable`); process.exit(1); }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(b)) { console.error(`❌ ${t.name}: adjacent variables`); process.exit(1); }
    const n = (t.body.match(/\{\{\d+\}\}/g) || []).length;
    if (n !== t.example.length) { console.error(`❌ ${t.name}: ${n} vars but ${t.example.length} samples`); process.exit(1); }
  }

  console.log(`${dry ? "DRY RUN — " : ""}${todo.length} template(s) via WATI${only ? ` (--only ${only})` : ""}\n`);
  if (dry) {
    for (const t of todo) console.log(`── ${t.name} (${t.category}${t.button ? ", +button" : ", no button"}) ──\n${JSON.stringify(watiPayload(t), null, 2)}\n`);
    console.log("Nothing sent (--dry). Drop --dry to submit.");
    return;
  }
  if (!watiEndpoint() || !watiToken()) { console.error("Need WATI_API_ENDPOINT and WATI_ACCESS_TOKEN."); process.exit(1); }
  return (async () => {
    for (const t of todo) {
      try { const ok = await createViaWati(t); console.log(`✅ ${t.name} → ${ok}`); }
      catch (e) { console.error(`❌ ${t.name} → ${e.message}`); }
    }
    console.log("\nDone. Watch WATI for PENDING → APPROVED.");
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
