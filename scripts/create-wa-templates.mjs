// Create all 8 WhatsApp templates via Meta's WhatsApp Business Management API.
// Templates live at the WABA level, so once created they appear in WATI too and
// are sendable by name. Meta still reviews them for approval after submission.
//
// Requires a Meta system-user token with `whatsapp_business_management` for the
// Business Manager that owns the WABA:
//   META_ACCESS_TOKEN=... META_WABA_ID=1014712724510403 node scripts/create-wa-templates.mjs
//
// Meta rules honoured here: body never starts/ends with a variable, no two
// adjacent variables. The venue map + support number are STATIC, so they are a
// static "Get Directions" URL button and hardcoded text — not variables. The
// only variables are {{1}} first name (all) and {{2}} booking link (WA-1..4).

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN;
const WABA_ID = process.env.META_WABA_ID || "1014712724510403";
const LANG = process.env.META_TEMPLATE_LANG || "en";

export const HEADER = "🎯 HIGH-PERFORMANCE TEAMS WORKSHOP";
export const FOOTER = "Diacto Technologies";
export const MAP_URL = "https://maps.app.goo.gl/MtpixrnbfgNFHYku5";
export const SUPPORT = "+91 7387731069";
// Static URL button — same for everyone, so no send-time variable.
export const BUTTON = { type: "URL", text: "📍 Get Directions", url: MAP_URL };

const EX_NAME = "Priya";
const EX_LINK = "https://diacto-workshop.example.com/?rid=abc123";
const EX_PASS = "https://diacto-workshop.example.com/api/pass?rid=abc123";
// For the DOCUMENT-header template (WA-5), Meta needs a sample media handle at
// creation. Upload a sample PDF via Meta's resumable upload API and set this env.
const SAMPLE_DOC_HANDLE = process.env.META_SAMPLE_DOC_HANDLE || "";

const V_BOOK = ["First name", "Booking link"];
const V_PASS = ["First name", "Event Pass link"];

// name, category, variable labels, ordered example values, and body text.
export const TEMPLATES = [
  {
    name: "wa_1_booking_pending",
    category: "MARKETING",
    labels: V_BOOK,
    example: [EX_NAME, EX_LINK],
    body:
      "Hi {{1}} 👋 Thanks for your interest in the High-Performance Teams Workshop — FREE, exclusively for Founders & Business Owners.\n" +
      "🗓 Fri, 17 July  |  🕒 3–6 PM  |  📍 Prabhavee Tech Park, Baner, Pune\n" +
      "⚠️ Your seat is not confirmed yet. Book in 30 seconds here: {{2}}\n" +
      "Tap “Get Directions” below for the venue map. See you there! 🚀",
  },
  {
    name: "wa_2_value_nudge",
    category: "MARKETING",
    labels: V_BOOK,
    example: [EX_NAME, EX_LINK],
    body:
      "Hi {{1}}, your seat for the High-Performance Teams Workshop is still on hold. ⏳\n" +
      "In 3 hours you'll get:\n" +
      "✅ The A.S.K. Framework to hire right, every time\n" +
      "✅ Scientific Hiring — no more gut-feel decisions\n" +
      "✅ Ready-to-use tools & templates\n" +
      "🗓 Fri, 17 July | 3–6 PM | Baner, Pune | FREE\n" +
      "Confirm your seat here: {{2}}\n" +
      "Don't miss it — seats are limited. 👇",
  },
  {
    name: "wa_3_problem_nudge",
    category: "MARKETING",
    labels: V_BOOK,
    example: [EX_NAME, EX_LINK],
    body:
      "Hey {{1}}, one question 👇\n" +
      "Is your business growing as fast as it should — or is your team slowing you down?\n" +
      "Wrong hiring is one of the biggest reasons businesses fail to scale. The High-Performance Teams Workshop shows you how to fix it — scientifically.\n" +
      "🗓 Fri, 17 July | 3–6 PM | Baner, Pune\n" +
      "Confirm your seat here: {{2}}\n" +
      "Reserve your spot before it's gone. 🚀",
  },
  {
    name: "wa_4_urgency_nudge",
    category: "MARKETING",
    labels: V_BOOK,
    example: [EX_NAME, EX_LINK],
    body:
      "Hi {{1}}, seats are filling fast — your booking is still incomplete. ⏰\n" +
      "High-Performance Teams Workshop — Fri, 17 July | 3–6 PM | Baner, Pune | FREE\n" +
      "Take 30 seconds to confirm here: {{2}}\n" +
      "Don't let your seat be released. 👇",
  },
  {
    // Text header + tap-to-download pass link. (Native document attachment needs
    // a dynamic media header, which WATI's builder does not currently accept —
    // it validates the header field as a real URL and rejects a {{variable}}.)
    name: "wa_5_confirmation_dynamic",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    body:
      "🎉 Congratulations {{1}}! Your seat for the High-Performance Teams Workshop is CONFIRMED.\n" +
      "🗓 Fri, 17 July  |  🕒 3–6 PM  |  📍 Prabhavee Tech Park, Baner, Pune\n" +
      "📎 Your Event Pass: {{2}}\n" +
      "Also emailed to you — carry it (digital or print) for entry. Tap “Get Directions” below. See you there! 🚀",
  },
  {
    name: "wa_6_day_before",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    body:
      "Hi {{1}}! Tomorrow at 3 PM — High-Performance Teams Workshop, Prabhavee Tech Park, Baner.\n" +
      "📎 Your Event Pass: {{2}}\n" +
      "Check-in opens 2:30 PM. Tap “Get Directions” below. See you there! 🚀",
  },
  {
    name: "wa_7_morning_of",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    body:
      "Good morning {{1}}! ☀️ The High-Performance Teams Workshop is today at 3 PM — doors open 2:30 PM, Prabhavee Tech Park, Baner.\n" +
      "📎 Your Event Pass: {{2}}\n" +
      "Friday traffic in Baner — leave early! Tap “Get Directions” below. ✅",
  },
  {
    name: "wa_8_two_hour",
    category: "UTILITY",
    labels: V_PASS,
    example: [EX_NAME, EX_PASS],
    body:
      "Hi {{1}}, the High-Performance Teams Workshop goes live in 2 hours! ⏳ 3:00 PM sharp, Prabhavee Tech Park, Baner.\n" +
      "📎 Your Event Pass: {{2}}\n" +
      `Show it at check-in. Need help? Call ${SUPPORT}. Tap “Get Directions” below. 🚀`,
  },
];

function payload(t) {
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

async function createOne(t) {
  const res = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload(t)),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`✅ ${t.name} → id=${data.id} status=${data.status ?? "PENDING"}`);
  } else {
    const err = data?.error?.error_user_msg || data?.error?.message || JSON.stringify(data);
    console.error(`❌ ${t.name} → ${res.status}: ${err}`);
  }
}

async function main() {
  if (!TOKEN) {
    console.error("Set META_ACCESS_TOKEN (system-user token with whatsapp_business_management).");
    process.exit(1);
  }
  console.log(`Creating ${TEMPLATES.length} templates on WABA ${WABA_ID} (lang ${LANG})…\n`);
  for (const t of TEMPLATES) {
    // eslint-disable-next-line no-await-in-loop
    await createOne(t);
  }
  console.log("\nDone. Check Meta / WATI for approval status (PENDING → APPROVED).");
}

// Only run when invoked directly (not when imported by export-wa-templates.mjs).
if (import.meta.url === `file://${process.argv[1]}`) main();
