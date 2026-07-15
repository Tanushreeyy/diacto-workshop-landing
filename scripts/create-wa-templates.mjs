// Create/submit the WhatsApp templates for the workshop.
//
// The workshop DATE used to be baked into each template body as literal text
// ("Fri, 17 July"). A Meta-approved template can't be edited in place, so every
// postponement meant rebuilding all of them. Now the date — weekday AND day,
// together — is a send-time VARIABLE ({{2}}), so moving the workshop is a single
// env var (EVENT_DATE_SHORT) and never a template rebuild again.
//
// WA-1…WA-5 are rebuilt under NEW names (…_v2): the live templates hardcode the
// workshop date in the body ("17 July"), so the rebuild swaps that for the {{2}} date
// variable. Headers are plain text — the live templates are already emoji-free, which
// is what WATI requires. The old date-in-the-body WA-1…WA-5 stay live until deleted.
//
// WA-6…WA-8 are already APPROVED, emoji-free and dateless ("tomorrow"/"today"/"in 2
// hours"), so they are LEFT AS-IS (`existing: true`) on their original names — nothing
// to change. (WA-8's live name is "wa_two_hour"; "wa_8_two_hour" was deleted.)
// All of the above was verified against the live WATI account via getMessageTemplates.
//
// Two submission backends (pick with env; the WATI one needs no Meta secret):
//   WATI  — POST {WATI_API_ENDPOINT}/api/v1/whatsApp/templates, Bearer WATI token.
//           We already hold this token, so this is the default.
//   Meta  — POST graph.facebook.com/{WABA}/message_templates, needs a Meta
//           system-user token (META_ACCESS_TOKEN) with whatsapp_business_management.
//
//   node scripts/create-wa-templates.mjs --dry     # print payloads, send nothing
//   WATI_API_ENDPOINT=… WATI_ACCESS_TOKEN=… node scripts/create-wa-templates.mjs
//   META_ACCESS_TOKEN=… node scripts/create-wa-templates.mjs --via meta

import { readFileSync } from "fs";

const GRAPH = "https://graph.facebook.com/v21.0";
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const WABA_ID = process.env.META_WABA_ID || "1014712724510403";
const LANG = process.env.META_TEMPLATE_LANG || "en_US"; // the account's live templates are en_US

// Read fresh (not at import time) so an --env-file loaded inside main() is respected.
const watiEndpoint = () => (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const watiToken = () => process.env.WATI_ACCESS_TOKEN || "";

// Text header — NO emoji. Meta/WATI reject emojis in the template header (body
// emojis are fine). Keep this plain text.
export const HEADER = "HIGH-PERFORMANCE TEAMS WORKSHOP";
export const FOOTER = "Diacto Technologies";
export const MAP_URL = "https://maps.app.goo.gl/MtpixrnbfgNFHYku5";
export const SUPPORT = "+91 7387731069";
// Static URL button — same for everyone, so no send-time variable. No emoji in the
// button text either, for the same WATI reason as the header.
export const BUTTON = { type: "URL", text: "Get Directions", url: MAP_URL };

const EX_NAME = "Priya";
const EX_DATE = "Fri, 24 July"; // sample for the {{date}} variable (weekday + date)
const EX_LINK = "https://diacto-workshop.example.com/?rid=abc123";
const EX_PASS = "https://diacto-workshop.example.com/api/pass?rid=abc123";
// For the DOCUMENT-header template (WA-5), Meta needs a sample media handle at
// creation. Upload a sample PDF via Meta's resumable upload API and set this env.
const SAMPLE_DOC_HANDLE = process.env.META_SAMPLE_DOC_HANDLE || "";

// Variable-label sets, in send order (must match waParamsFor in messages.ts).
const V_BOOK_DATE = ["First name", "Date", "Booking link"]; // WA-1…WA-4
const V_PASS_DATE = ["First name", "Date", "Event Pass link"]; // WA-5
const V_PASS = ["First name", "Event Pass link"]; // WA-6…WA-8 (no date)

// name, category, variable labels, ordered example values, and body text.
// `rebuild: true`  → a new …_v2 template this script should create.
// `existing: true` → already live and unchanged; documented here but NOT created.
export const TEMPLATES = [
  {
    name: "wa_1_booking_pending_v2",
    category: "MARKETING",
    labels: V_BOOK_DATE,
    example: [EX_NAME, EX_DATE, EX_LINK],
    rebuild: true,
    body:
      "Hi {{1}} 👋 Thanks for your interest in the High-Performance Teams Workshop — FREE, exclusively for Founders & Business Owners.\n\n" +
      "🗓 {{2}}  |  🕒 3–6 PM  |  📍 Prabhavee Tech Park, Baner, Pune\n\n" +
      "⚠️ Your seat is not confirmed yet. Book in 30 seconds here: {{3}}\n\n" +
      "Tap “Get Directions” below for the venue map. See you there! 🚀",
  },
  {
    name: "wa_2_value_nudge_v2",
    category: "MARKETING",
    labels: V_BOOK_DATE,
    example: [EX_NAME, EX_DATE, EX_LINK],
    rebuild: true,
    body:
      "Hi {{1}}, your seat for the High-Performance Teams Workshop is still on hold. ⏳\n\n" +
      "In 3 hours you'll get:\n" +
      "✅ The A.S.K. Framework to hire right, every time\n" +
      "✅ Scientific Hiring — no more gut-feel decisions\n" +
      "✅ Ready-to-use tools & templates\n\n" +
      "🗓 {{2}} | 3–6 PM | Baner, Pune | FREE\n\n" +
      "Confirm your seat here: {{3}}\n\n" +
      "Don't miss it — seats are limited. 👇",
  },
  {
    name: "wa_3_problem_nudge_v2",
    category: "MARKETING",
    labels: V_BOOK_DATE,
    example: [EX_NAME, EX_DATE, EX_LINK],
    rebuild: true,
    body:
      "Hey {{1}}, one question 👇\n" +
      "Is your business growing as fast as it should — or is your team slowing you down?\n" +
      "Wrong hiring is one of the biggest reasons businesses fail to scale. The High-Performance Teams Workshop shows you how to fix it — scientifically.\n\n" +
      "🗓 {{2}} | 3–6 PM | Baner, Pune\n\n" +
      "Confirm your seat here: {{3}}\n\n" +
      "Reserve your spot before it's gone. 🚀",
  },
  {
    name: "wa_4_urgency_nudge_v2",
    category: "MARKETING",
    labels: V_BOOK_DATE,
    example: [EX_NAME, EX_DATE, EX_LINK],
    rebuild: true,
    body:
      "Hi {{1}}, seats are filling fast — your booking is still incomplete. ⏰\n\n" +
      "High-Performance Teams Workshop — {{2}} | 3–6 PM | Baner, Pune | FREE\n\n" +
      "Take 30 seconds to confirm here: {{3}}\n\n" +
      "Don't let your seat be released. 👇",
  },
  {
    name: "wa_5_confirmation_link_v2",
    category: "UTILITY",
    labels: V_PASS_DATE,
    example: [EX_NAME, EX_DATE, EX_PASS],
    rebuild: true,
    body:
      "🎉 Congratulations {{1}}! Your seat for the High-Performance Teams Workshop is CONFIRMED.\n\n" +
      "🗓 {{2}}  |  🕒 3–6 PM  |  📍 Prabhavee Tech Park, Baner, Pune\n\n" +
      "📎 Your Event Pass: {{3}}\n\n" +
      "Also emailed to you — carry it (digital or print) for entry. Tap “Get Directions” below. See you there! 🚀",
  },
  {
    // Relative time ("tomorrow") — no date. Live template APPROVED & emoji-free; kept.
    name: "wa_6_day_before",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    existing: true,
    body:
      "Hi {{1}}! Tomorrow at 3 PM — High-Performance Teams Workshop, Prabhavee Tech Park, Baner.\n\n" +
      "📎 Your Event Pass: {{2}}\n\n" +
      "Check-in opens 2:30 PM. Tap “Get Directions” below. See you there! 🚀",
  },
  {
    name: "wa_7_morning_of",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    existing: true,
    body:
      "Good morning {{1}}! ☀️ The High-Performance Teams Workshop is today at 3 PM — doors open 2:30 PM, Prabhavee Tech Park, Baner.\n\n" +
      "📎 Your Event Pass: {{2}}\n\n" +
      "Friday traffic in Baner — leave early! Tap “Get Directions” below. ✅",
  },
  {
    // Live approved name is "wa_two_hour" (the "wa_8_two_hour" template was deleted).
    name: "wa_two_hour",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    existing: true,
    body:
      "Hi {{1}}, the High-Performance Teams Workshop goes live in 2 hours! ⏳ 3:00 PM sharp, Prabhavee Tech Park, Baner.\n\n" +
      "📎 Your Event Pass: {{2}}\n\n" +
      `Show it at check-in. Need help? Call ${SUPPORT}. Tap “Get Directions” below. 🚀`,
  },
];

// ─────────────────────────── Meta Graph payload ───────────────────────────
function metaPayload(t) {
  const header =
    t.headerFormat === "DOCUMENT"
      ? {
          type: "HEADER",
          format: "DOCUMENT",
          example: { header_handle: [SAMPLE_DOC_HANDLE || "<UPLOAD_SAMPLE_PDF_HANDLE>"] },
        }
      : { type: "HEADER", format: "TEXT", text: HEADER };
  const components = [
    header,
    { type: "BODY", text: t.body, example: { body_text: [t.example] } },
    { type: "FOOTER", text: FOOTER },
    { type: "BUTTONS", buttons: [BUTTON] },
  ];
  return { name: t.name, language: LANG, category: t.category, components };
}

// ─────────────────────────── WATI payload ───────────────────────────
// WATI proxies template creation to Meta. Its field set is only lightly documented
// (docs.wati.io shows names but not types), so we mirror the WATI builder: a TEXT
// header, the body with {{n}} variables, a footer, one static URL button, and the
// ordered sample values in customParams. If WATI rejects the shape, the copy-paste
// pack in whatsapp-templates/ is the can't-fail fallback (Add Template by hand).
function watiPayload(t) {
  return {
    type: "template",
    elementName: t.name,
    category: t.category,
    subCategory: "STANDARD",
    language: LANG,
    header: { type: "TEXT", text: HEADER },
    body: t.body,
    footer: FOOTER,
    buttonsType: "call_to_action",
    // WATI wants the button nested under `parameter` (type lowercase "url"); a flat
    // {type,text,url} makes it report "Button parameter is null". Shape mirrors what
    // getMessageTemplates returns for the live approved templates.
    buttons: [
      {
        type: "url",
        parameter: { text: BUTTON.text, phoneNumber: "", url: BUTTON.url, urlType: "static" },
      },
    ],
    // Ordered sample values Meta needs for review, one per {{n}}.
    customParams: t.example.map((value, i) => ({ paramName: String(i + 1), paramValue: value })),
    creationMethod: 0, // HUMAN
  };
}

async function createViaMeta(t) {
  const res = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(metaPayload(t)),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return `id=${data.id} status=${data.status ?? "PENDING"}`;
  throw new Error(`${res.status}: ${data?.error?.error_user_msg || data?.error?.message || JSON.stringify(data)}`);
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
  // WATI signals failure with HTTP 200 + {ok:false|result:false, message}, so check
  // the body, not just res.ok.
  const failed = data?.ok === false || data?.result === false;
  if (res.ok && !failed) return `status=${data.status || data.templateStatus || "PENDING"}`;
  throw new Error(`${res.status}: ${data?.message || data?.info || JSON.stringify(data).slice(0, 300)}`);
}

function main() {
  const dry = process.argv.includes("--dry");

  // Optional: load creds/config from an env file (KEY=value lines) so tokens never
  // land on the command line or the transcript. Only fills keys not already set.
  const efIdx = process.argv.indexOf("--env-file");
  if (efIdx >= 0 && process.argv[efIdx + 1]) {
    const text = readFileSync(process.argv[efIdx + 1], "utf8");
    for (const m of text.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }

  const viaIdx = process.argv.indexOf("--via");
  const viaArg = viaIdx >= 0 ? (process.argv[viaIdx + 1] || "").toLowerCase() : "";
  const via = viaArg || (watiToken() ? "wati" : META_TOKEN ? "meta" : "");

  // --only <substr> narrows to matching template name(s) — e.g. create just wa_1.
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx >= 0 ? (process.argv[onlyIdx + 1] || "") : "";
  let todo = TEMPLATES.filter((t) => t.rebuild); // only the …_v2 rebuilds
  if (only) todo = todo.filter((t) => t.name.includes(only));
  if (!todo.length) {
    console.error(only ? `No rebuild template matches --only "${only}".` : "Nothing to create.");
    process.exit(1);
  }

  console.log(`${dry ? "DRY RUN — " : ""}creating ${todo.length} template(s) via ${via || "??"}${only ? ` (--only ${only})` : ""}\n`);
  if (dry) {
    for (const t of todo) {
      const payload = via === "meta" ? metaPayload(t) : watiPayload(t);
      console.log(`── ${t.name} ──\n${JSON.stringify(payload, null, 2)}\n`);
    }
    console.log("Nothing sent (--dry). Drop --dry to submit.");
    return;
  }
  if (via === "wati" && (!watiEndpoint() || !watiToken())) {
    console.error("WATI backend needs WATI_API_ENDPOINT and WATI_ACCESS_TOKEN.");
    process.exit(1);
  }
  if (via === "meta" && !META_TOKEN) {
    console.error("Meta backend needs META_ACCESS_TOKEN (whatsapp_business_management).");
    process.exit(1);
  }
  if (!via) {
    console.error("Set WATI_ACCESS_TOKEN (recommended) or META_ACCESS_TOKEN, or pass --via.");
    process.exit(1);
  }

  return (async () => {
    for (const t of todo) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const ok = via === "meta" ? await createViaMeta(t) : await createViaWati(t);
        console.log(`✅ ${t.name} → ${ok}`);
      } catch (e) {
        console.error(`❌ ${t.name} → ${e.message}`);
      }
    }
    console.log("\nDone. Watch Meta/WATI for approval (PENDING → APPROVED), then the …_v2 names are live.");
  })();
}

// Only run when invoked directly (not when imported by export-wa-templates.mjs).
if (import.meta.url === `file://${process.argv[1]}`) main();
