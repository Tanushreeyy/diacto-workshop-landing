// Create/submit the CandidHR lead-generation WhatsApp template.
//
// Self-contained sibling of create-wa-templates-hr.mjs and -btb.mjs. This
// campaign is the `lead_capture` flow: a Meta Instant Form submission is a SALES
// ENQUIRY, not a registration. There is no event, no booking link, no Event Pass
// and no chasing ladder — one acknowledgement goes out the moment the lead lands,
// and the sales team takes it from there by phone.
//
// So this file holds exactly ONE template. That is not an omission.
//
//   node scripts/create-wa-templates-candidhr.mjs --dry                       # print, send nothing
//   node scripts/create-wa-templates-candidhr.mjs --env-file .env.production  # submit
//
// ─────────────────────────────────────────────────────────────────────────────
// UTILITY, for the same reason every HR-campaign template is UTILITY.
//
// On 1 Aug 2026 Meta quality-restricted this number and MARKETING sends failed at
// 41% while UTILITY failed at 0%. This message is an acknowledgement of something
// the person just did — they submitted a form and are being told it arrived and
// who will call them. That is transactional. A category CANNOT be changed after
// Meta approves a template, so the guard in main() refuses anything else.
// ─────────────────────────────────────────────────────────────────────────────
//
// The ops lead-alert templates (wa_lead_alert, wa_lead_alert_full) are already
// approved and campaign-agnostic — reuse them, do not resubmit.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const LANG = process.env.META_TEMPLATE_LANG || "en_US";
const FOOTER = "CandidHR.ai by Diacto Technologies";
const HEADER_LIMIT = 60;

// 31 characters, plain text. WATI rejects header emojis outright — the HR pack
// lost a submission to a 🎯 that also pushed the header past 60. Do not add one.
const HDR = "CANDIDHR.AI - AI-POWERED HIRING";

// Static URL button. The demo is the same video for every lead, so it costs a
// tap rather than a variable slot — the same reasoning the workshop templates
// use for the venue map. It ALSO rides as {{2}} in the body: see below.
const DEMO_URL = "https://www.youtube.com/watch?v=QycFhOi96LA";
const BUTTON = { type: "URL", text: "Watch the demo", url: DEMO_URL };

const watiEndpoint = () => (process.env.WATI_API_ENDPOINT || "").replace(/\/+$/, "");
const watiToken = () => process.env.WATI_ACCESS_TOKEN || "";

const EX_NAME = "Priya";
const EX_DEMO = DEMO_URL;

// Variable contract — matches lib/booking/messages.ts -> waParamsFor("lead"):
//   {{1}} first name · {{2}} demo video link
//
// The link rides as a VARIABLE even though it is the same for everyone today,
// and that is a deliberate exception to the "constants don't spend variable
// slots" rule the workshop templates follow. A Meta-approved template cannot be
// edited in place: bake the YouTube URL into the body and the day marketing
// re-cuts the demo, the whole template goes back through review and sends stop
// until it clears. As a variable it is one control-tab cell. This is the same
// lesson the _v2 rebuild learned from a hardcoded workshop date.
//
// The button URL is static because a button URL cannot be a variable — if the
// video changes, the button is stale until the template is resubmitted, while
// the body link is already correct. That asymmetry is why the link appears in
// both places rather than only on the button.
export const TEMPLATES = [
  {
    name: "wa_candidhr_lead_followup",
    category: "UTILITY",
    header: HDR,
    button: true,
    labels: ["First name", "Demo video link"],
    example: [EX_NAME, EX_DEMO],
    body:
      "Hi {{1}}! Thanks for your interest in CandidHR.ai.\n\n" +
      "We have successfully received your details. Our sales team will review your " +
      "requirements and get in touch with you shortly to discuss how CandidHR.ai can " +
      "support your hiring process.\n\n" +
      "Here's a quick demo of how the platform works: {{2}}\n\n" +
      "We look forward to connecting with you!",
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


// Copy-paste pack for whatsapp-templates/, in the same layout export-wa-templates.mjs
// produces for the workshop packs. That script reads create-wa-templates.mjs's module
// shape (HEADER/FOOTER/BUTTON as shared constants); this campaign's constants are
// local to this file, so it writes its own rather than bending the shared exporter
// around a one-template campaign.
//
//   node scripts/create-wa-templates-candidhr.mjs --export
function exportTxt() {
  const OUT = "whatsapp-templates";
  mkdirSync(OUT, { recursive: true });
  for (const t of TEMPLATES) {
    const vars = t.labels
      .map((lbl, j) => `  {{${j + 1}}} = ${lbl.padEnd(20)} sample: ${t.example[j]}`)
      .join("\n");
    const txt = `Template name : ${t.name}
Category      : ${t.category === "MARKETING" ? "Marketing" : "Utility"}
Language      : English (US) \u00b7 en_US

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 HEADER  (type: Text) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
${t.header}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 BODY \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
${t.body}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 FOOTER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
${FOOTER}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 VARIABLES / SAMPLE VALUES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
${vars}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 BUTTONS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
[URL button \u00b7 static]  ${BUTTON.text}  \u2192  ${BUTTON.url}
`;
    const file = `WA-CANDIDHR_${t.name}.txt`;
    writeFileSync(join(OUT, file), txt);
    console.log("wrote", file);
  }
}

function main() {
  if (process.argv.includes("--export")) return exportTxt();
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

  // Same local compliance guard as the workshop packs, so a bad edit can never
  // reach Meta. Meta's documented body rules first, then this account's own.
  for (const t of todo) {
    const b = t.body.trim();
    if (/^\{\{\d+\}\}/.test(b)) { console.error(`❌ ${t.name}: body STARTS with a variable`); process.exit(1); }
    if (/\{\{\d+\}\}$/.test(b)) { console.error(`❌ ${t.name}: body ENDS with a variable`); process.exit(1); }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(b)) { console.error(`❌ ${t.name}: adjacent variables`); process.exit(1); }
    const n = (b.match(/\{\{\d+\}\}/g) || []).length;
    if (n !== t.example.length) { console.error(`❌ ${t.name}: ${n} vars but ${t.example.length} samples`); process.exit(1); }

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
        `❌ ${t.name}: category is ${t.category}. This message acknowledges a form the ` +
          `person just submitted and names who will call them — transactional, not ` +
          `promotional. MARKETING is what Meta throttled on 1 Aug (41% failure), and the ` +
          `category cannot be changed after approval. Fix it here, not later.`,
      );
      process.exit(1);
    }
    // "Free" is a well-known promotional signal and cost this account a UTILITY
    // reclassification during the HR review. There is nothing free being offered
    // here, so its presence means somebody pasted workshop copy in by mistake.
    if (/\bfree\b/i.test(b)) {
      console.error(`❌ ${t.name}: body says "free" — a MARKETING signal, and this campaign offers nothing free`);
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
    console.log("Then set tpl_wa_lead_followup in the campaign sheet's control tab.");
  })();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
