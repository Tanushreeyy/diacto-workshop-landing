// Create all 8 WhatsApp templates via Meta's WhatsApp Business Management API.
// Templates live at the WABA level, so once created they appear in WATI too and
// are sendable by name. Meta still reviews them for approval after submission.
//
// Requires a Meta system-user token with `whatsapp_business_management` for the
// Business Manager that owns the WABA:
//   META_ACCESS_TOKEN=... META_WABA_ID=1014712724510403 node scripts/create-wa-templates.mjs
//
// Body variables use Meta's numbered {{1}},{{2}},{{3}} form. `example` values are
// required by Meta for approval. Header/footer are optional.

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN;
const WABA_ID = process.env.META_WABA_ID || "1014712724510403";
const LANG = process.env.META_TEMPLATE_LANG || "en";

export const HEADER = "🎯 HIGH-PERFORMANCE TEAMS WORKSHOP";
export const FOOTER = "Diacto Technologies";
const EX_NAME = "Priya";
const EX_LINK = "https://diacto-workshop.example.com/?rid=abc123";
const EX_MAP = "https://maps.app.goo.gl/MtpixrnbfgNFHYku5";
const EX_SUPPORT = "+91 7387731069";

const V_BOOK = ["First name", "Booking link", "Location (map) link"];
const V_MAP = ["First name", "Location (map) link"];
const V_SUPPORT = ["First name", "Location (map) link", "Support number"];

// name, category, body text (with {{n}}), variable labels, and example values.
export const TEMPLATES = [
  {
    name: "wa_1_booking_pending",
    category: "MARKETING",
    labels: V_BOOK,
    body:
      "Hi {{1}} 👋 Thanks for your interest in the High-Performance Teams Workshop — FREE, exclusively for Founders & Business Owners.\n" +
      "🗓 Fri, 17 July  |  🕒 3–6 PM  |  📍 Prabhavee Tech Park, Baner, Pune\n" +
      "⚠️ Your seat is not confirmed yet. Book in 30 seconds:\n" +
      "👉 {{2}}\n📍 Directions: {{3}}",
    example: [EX_NAME, EX_LINK, EX_MAP],
  },
  {
    name: "wa_2_value_nudge",
    category: "MARKETING",
    labels: V_BOOK,
    body:
      "Hi {{1}}, your seat for the High-Performance Teams Workshop is still on hold. ⏳\n" +
      "In 3 hours you'll get:\n" +
      "✅ The A.S.K. Framework to hire right, every time\n" +
      "✅ Scientific Hiring — no more gut-feel decisions\n" +
      "✅ Ready-to-use tools & templates\n" +
      "🗓 Fri, 17 July  |  3–6 PM  |  Baner, Pune  |  FREE\n" +
      "👉 {{2}}\n📍 Directions: {{3}}",
    example: [EX_NAME, EX_LINK, EX_MAP],
  },
  {
    name: "wa_3_problem_nudge",
    category: "MARKETING",
    labels: V_BOOK,
    body:
      "{{1}}, one question 👇\n" +
      "Is your business growing as fast as it should — or is your team slowing you down?\n" +
      "Wrong hiring is one of the biggest reasons businesses fail to scale. The High-Performance Teams Workshop shows you how to fix it — scientifically.\n" +
      "🗓 Fri, 17 July  |  3–6 PM  |  Baner, Pune\n" +
      "👉 Confirm your seat: {{2}}\n📍 Directions: {{3}}",
    example: [EX_NAME, EX_LINK, EX_MAP],
  },
  {
    name: "wa_4_urgency_nudge",
    category: "MARKETING",
    labels: V_BOOK,
    body:
      "{{1}}, seats are filling fast — your booking is still incomplete. ⏰\n" +
      "High-Performance Teams Workshop — Fri, 17 July | 3–6 PM | Baner, Pune | FREE\n" +
      "Take 30 seconds:\n👉 {{2}}\n📍 Directions: {{3}}",
    example: [EX_NAME, EX_LINK, EX_MAP],
  },
  {
    name: "wa_5_confirmation",
    category: "UTILITY",
    labels: V_MAP,
    body:
      "🎉 {{1}}, your seat for the High-Performance Teams Workshop is CONFIRMED!\n" +
      "🗓 Fri, 17 July  |  🕒 3–6 PM  |  📍 Prabhavee Tech Park, Baner, Pune\n" +
      "🗺 {{2}}\n" +
      "📩 Your Event Pass (PDF) is in your email — carry it (digital or print) for entry. Our team will call you shortly.\n" +
      "See you there! 🚀",
    example: [EX_NAME, EX_MAP],
  },
  {
    name: "wa_6_day_before",
    category: "UTILITY",
    labels: V_MAP,
    body:
      "Hi {{1}}! Tomorrow at 3 PM — High-Performance Teams Workshop, Prabhavee Tech Park, Baner. 🗺 {{2}}\n" +
      "Your Event Pass is in your email 📩. Check-in opens 2:30 PM. See you there! 🚀",
    example: [EX_NAME, EX_MAP],
  },
  {
    name: "wa_7_morning_of",
    category: "UTILITY",
    labels: V_MAP,
    body:
      "Good morning {{1}}! ☀️ The High-Performance Teams Workshop is today at 3 PM — doors open 2:30 PM, Prabhavee Tech Park, Baner. 🗺 {{2}}\n" +
      "Carry your Event Pass (in your email 📩). Friday traffic in Baner — leave early! See you soon. ✅",
    example: [EX_NAME, EX_MAP],
  },
  {
    name: "wa_8_two_hour",
    category: "UTILITY",
    labels: V_SUPPORT,
    body:
      "{{1}}, the High-Performance Teams Workshop goes live in 2 hours! ⏳ 3:00 PM sharp, Prabhavee Tech Park, Baner. 🗺 {{2}}\n" +
      "Show your Event Pass at check-in. Need help? Call {{3}}. 🚀",
    example: [EX_NAME, EX_MAP, EX_SUPPORT],
  },
];

function payload(t) {
  return {
    name: t.name,
    language: LANG,
    category: t.category,
    components: [
      { type: "HEADER", format: "TEXT", text: HEADER },
      { type: "BODY", text: t.body, example: { body_text: [t.example] } },
      { type: "FOOTER", text: FOOTER },
    ],
  };
}

async function createOne(t) {
  const res = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
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
    // Sequential to keep Meta's rate limits happy and logs readable.
    // eslint-disable-next-line no-await-in-loop
    await createOne(t);
  }
  console.log("\nDone. Check Meta / WATI for approval status (PENDING → APPROVED).");
}

// Only run when invoked directly (not when imported by export-wa-templates.mjs).
if (import.meta.url === `file://${process.argv[1]}`) main();
