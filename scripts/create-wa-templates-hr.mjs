// Create/submit the HR Workshop (Wed 12 Aug 2026) WhatsApp templates.
//
// Self-contained sibling of create-wa-templates-btb.mjs. This campaign is the
// `sdr_assisted` flow: the Meta Instant Form submission IS the registration, SDRs
// confirm by phone, and there is no landing page in the funnel. So there is no
// booking link and no WA-1..4 chasing ladder — only a confirmation and three
// reminders, all of them transactional.
//
//   node scripts/create-wa-templates-hr.mjs --dry                          # print, send nothing
//   node scripts/create-wa-templates-hr.mjs --env-file .env.production     # submit all
//   node scripts/create-wa-templates-hr.mjs --env-file .env.production --only wa_5
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY TEMPLATE HERE IS **UTILITY**, AND THAT IS THE WHOLE POINT.
//
// On 1 Aug 2026 Meta quality-restricted this number. Measured that day:
//     UTILITY   — 30 sent,  0 failed
//     MARKETING — 36 sent, 25 failed (41%)
// Nine registered attendees silently missed their 2-hour reminder because
// wa_two_hour was categorised MARKETING, while the UTILITY reminders that same
// morning reached all 27. A confirmation and an event reminder sent to somebody
// who has already registered are transactional, not promotional.
//
// A category CANNOT be changed after Meta approves a template. The guard in
// main() refuses to submit anything from this file as MARKETING.
// ─────────────────────────────────────────────────────────────────────────────
//
// The two ops lead-alert templates (wa_lead_alert, wa_lead_alert_full) are ALREADY
// APPROVED and campaign-agnostic — reuse them, do not resubmit.

import { readFileSync } from "fs";

const LANG = process.env.META_TEMPLATE_LANG || "en_US";
const FOOTER = "Diacto Technologies";
const SUPPORT = "+91 7387731069";
const MAP_URL = "https://maps.app.goo.gl/MtpixrnbfgNFHYku5";
const BUTTON = { type: "URL", text: "Get Directions", url: MAP_URL };

// Venue confirmed same as BTB, including the unit number — it prints on the Event
// Pass and in every message, so the full address is used, not just the building.
const VENUE = "901, B Wing, Prabhavee Tech Park, Baner, Pune";

// 59 characters. WhatsApp's header limit is 60, and WATI rejects header emojis —
// the drafted header opened with a 🎯 which pushed it to 61 and would have been
// rejected twice over. Do not add one back.
const HDR = "A FREE PRACTICAL WORKSHOP FOR HR MANAGERS, TA HEADS & CHROs";
const HEADER_LIMIT = 60;

const watiEndpoint = () => (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const watiToken = () => process.env.WATI_ACCESS_TOKEN || "";

const EX_NAME = "Priya";
const EX_DATE = "Wed, 12 August";
const EX_PASS = "https://workshop.diacto.com/api/pass?rid=abc123";

// Variable contract — matches lib/booking/messages.ts -> waParamsFor exactly, so
// no code change is needed:
//   WA-5 carries the date : {{1}} first name · {{2}} date · {{3}} Event Pass link
//   WA-6/7/8 are relative  : {{1}} first name · {{2}} Event Pass link
//
// The date rides as a VARIABLE deliberately. The drafted copy hardcoded
// "Wed, 12 August", which is why the _v2 rebuild existed in the first place — an
// approved template cannot be edited, so a hardcoded date turns a postponement
// into a full re-approval. As a variable it is one env change.
//
// The map link is a STATIC button, not a variable: the venue is identical for
// every recipient, so it would spend a variable slot on constant data.
// The support number is static text for the same reason.
export const TEMPLATES = [
  {
    name: "wa_5_hr_confirmation",
    category: "UTILITY",
    header: HDR,
    button: true,
    example: [EX_NAME, EX_DATE, EX_PASS],
    body:
      "Congratulations {{1}}! Your seat for the Free Practical Workshop for HR Managers, TA Heads & CHROs is CONFIRMED. 🎉\n\n" +
      `🗓 {{2}}  |  🕒 3:00 PM – 6:00 PM (check-in from 2:30 PM)\n📍 ${VENUE}\n\n` +
      "🎫 Your Event Pass (PDF): {{3}}\n\n" +
      "Carry it (digital or print) for entry. Our team will call you shortly to confirm your attendance. Tap “Get Directions” below for the venue map. See you there! 🚀",
  },

  {
    name: "wa_6_hr_day_before",
    category: "UTILITY",
    header: HDR,
    button: true,
    example: [EX_NAME, EX_PASS],
    body:
      `Hi {{1}}! Tomorrow at 3:00 PM — the Free Practical Workshop for HR Managers, TA Heads & CHROs, at ${VENUE}.\n\n` +
      "🎫 Your Event Pass: {{2}}\n\n" +
      "Check-in opens 2:30 PM. Tap “Get Directions” below for the venue map. See you there! 🚀",
  },

  {
    name: "wa_7_hr_morning_of",
    category: "UTILITY",
    header: HDR,
    button: true,
    example: [EX_NAME, EX_PASS],
    body:
      `Good morning {{1}}! The Free Practical Workshop for HR Managers, TA Heads & CHROs is today at 3:00 PM — doors open 2:30 PM, at ${VENUE}.\n\n` +
      "🎫 Your Event Pass: {{2}}\n\n" +
      "Weekday traffic in Baner can be slow — please leave early. See you soon! ✅",
  },

  // v1 (`wa_8_hr_two_hour`) was REJECTED by Meta with no stated reason. Comparing it
  // against wa_8_btb_two_hour_v3 — the same message for the previous campaign, which
  // Meta APPROVED — it differed in three ways, and this rebuild reverts all three to
  // the wording that passed:
  //
  //   1. it carried a phone number in the body ("Need help finding us? Call +91 …").
  //      The approved template has none, and none of the three HR templates that
  //      cleared review had one either. This is the most likely trigger: inline
  //      contact details in a template body are routinely refused.
  //   2. "goes live in 2 hours … 3:00 PM sharp" → the approved phrasing is the
  //      flatter, more factual "Just 2 hours to go … begins at 3 PM today".
  //   3. it closed on a promotional flourish ("🚀") rather than the approved "✅".
  //
  // "Free" is also dropped from the body here. Meta reclassified wa_7_hr_morning_of
  // from UTILITY to MARKETING during review, and the approved BTB templates never
  // used the word — it is a well-known promotional signal, and this campaign's whole
  // deliverability argument rests on staying out of the MARKETING bucket.
  //
  // A rejected name cannot be resubmitted, hence _v2.
  {
    name: "wa_8_hr_two_hour_v2",
    category: "UTILITY",
    header: HDR,
    button: true,
    example: [EX_NAME, EX_PASS],
    body:
      `Hi {{1}}! Just 2 hours to go — the Practical Workshop for HR Managers, TA Heads & CHROs begins at 3 PM today, doors open 2:30 PM, ${VENUE}.\n\n` +
      "📎 Your Event Pass: {{2}}\n\n" +
      "Weekday traffic in Baner — leave now to be on time! Tap “Get Directions” below. ✅",
  },
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
    p.buttons = [
      { type: "url", parameter: { text: BUTTON.text, phoneNumber: "", url: BUTTON.url, urlType: "static" } },
    ];
  }
  return p;
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

function main() {
  const dry = process.argv.includes("--dry");
  const efIdx = process.argv.indexOf("--env-file");
  if (efIdx >= 0 && process.argv[efIdx + 1]) {
    const text = readFileSync(process.argv[efIdx + 1], "utf8");
    for (const m of text.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] || "" : "";
  let todo = TEMPLATES;
  if (only) todo = todo.filter((t) => t.name.includes(only));
  if (!todo.length) {
    console.error(`No template matches --only "${only}".`);
    process.exit(1);
  }

  // Local compliance guard, so a bad edit can never reach Meta. The first four
  // checks are Meta's documented body rules; the last two are this campaign's own
  // hard-won rules and both correspond to a real defect found in the draft copy.
  for (const t of todo) {
    const b = t.body.trim();
    if (/^\{\{\d+\}\}/.test(b)) { console.error(`❌ ${t.name}: body STARTS with a variable`); process.exit(1); }
    if (/\{\{\d+\}\}$/.test(b)) { console.error(`❌ ${t.name}: body ENDS with a variable`); process.exit(1); }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(b)) { console.error(`❌ ${t.name}: adjacent variables`); process.exit(1); }
    const n = (b.match(/\{\{\d+\}\}/g) || []).length;
    if (n !== t.example.length) { console.error(`❌ ${t.name}: ${n} vars but ${t.example.length} samples`); process.exit(1); }

    // Header: 61 chars with the drafted 🎯, and WATI rejects header emojis outright.
    if (t.header.length > HEADER_LIMIT) {
      console.error(`❌ ${t.name}: header is ${t.header.length} chars (limit ${HEADER_LIMIT})`);
      process.exit(1);
    }
    if (/\p{Extended_Pictographic}/u.test(t.header)) {
      console.error(`❌ ${t.name}: header contains an emoji — WATI rejects these`);
      process.exit(1);
    }
    // The 1 Aug lesson, enforced rather than remembered.
    if (t.category !== "UTILITY") {
      console.error(
        `❌ ${t.name}: category is ${t.category}. Every template in this campaign is a ` +
          `confirmation or a reminder to someone already registered, i.e. transactional. ` +
          `MARKETING is what Meta throttled on 1 Aug (41% failure). Category cannot be ` +
          `changed after approval — fix it here, not later.`,
      );
      process.exit(1);
    }
  }

  console.log(`${dry ? "DRY RUN — " : ""}${todo.length} template(s) via WATI${only ? ` (--only ${only})` : ""}\n`);
  if (dry) {
    for (const t of todo) {
      console.log(`── ${t.name} (${t.category}, header ${t.header.length} chars) ──`);
      console.log(JSON.stringify(watiPayload(t), null, 2) + "\n");
    }
    console.log("Nothing sent (--dry). Drop --dry to submit.");
    return;
  }
  if (!watiEndpoint() || !watiToken()) {
    console.error("Need WATI_API_ENDPOINT and WATI_ACCESS_TOKEN.");
    process.exit(1);
  }
  return (async () => {
    for (const t of todo) {
      try {
        const ok = await createViaWati(t);
        console.log(`✅ ${t.name} → ${ok}`);
      } catch (e) {
        console.error(`❌ ${t.name} → ${e.message}`);
      }
    }
    console.log("\nDone. Watch WATI for PENDING → APPROVED.");
    console.log("Then set tpl_wa_* in the new sheet's control tab.");
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
