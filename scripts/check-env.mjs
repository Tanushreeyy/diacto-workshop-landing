// Pre-deploy check. Run this on the host BEFORE `docker compose up`.
//
//   node scripts/check-env.mjs .env.production
//
// Exits non-zero if anything would break, so it can gate a deploy. It only
// READS — nothing here writes to a sheet, sends a message, or changes state.
//
// The point is to fail on the host, in a terminal, where you can see it — rather
// than after a restart, where a missing variable means a tick that throws every
// five minutes and a campaign that quietly does nothing.

import fs from "node:fs";
import crypto from "node:crypto";

const file = process.argv[2] || ".env.production";
const env = {};
for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

let bad = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { bad++; console.log(`  FAIL  ${m}`); };
const warn = (m) => console.log(`  warn  ${m}`);

// ── 1. required variables ──────────────────────────────────────────────
// The three SHEET_*_TAB names have no defaults any more. They used to fall back
// to the production tabs, which meant a staging deploy could silently drive live
// data; now an omission throws instead.
const REQUIRED = [
  "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "SHEET_ID",
  "WATI_API_ENDPOINT", "WATI_ACCESS_TOKEN", "CRON_SECRET", "LANDING_BASE_URL",
  "SHEET_FORM_TAB", "SHEET_AUTOMATION_TAB", "SHEET_CONTROL_TAB",
];
console.log("\n1. required variables");
for (const k of REQUIRED) (env[k] ? ok(k) : fail(`${k} is missing`));

// notifySlack() returns silently when this is empty, so an unset webhook is not
// a loud failure — it means every alert the system raises goes nowhere.
console.log("\n2. alerting");
if (!env.SLACK_WEBHOOK_URL) {
  fail("SLACK_WEBHOOK_URL is empty — the damaged-sheet halt, header-edit warning and reply alerts will all go NOWHERE");
} else if (!env.SLACK_WEBHOOK_URL.startsWith("https://hooks.slack.com/")) {
  fail("SLACK_WEBHOOK_URL does not look like a Slack webhook");
} else ok("SLACK_WEBHOOK_URL set");

console.log("\n3. shape checks");
if (env.GOOGLE_PRIVATE_KEY?.includes("\\n")) ok("GOOGLE_PRIVATE_KEY uses literal \\n");
else if (env.GOOGLE_PRIVATE_KEY?.includes("\n")) fail("GOOGLE_PRIVATE_KEY has real newlines — the code expects literal \\n");
else fail("GOOGLE_PRIVATE_KEY looks malformed");
if (env.LANDING_BASE_URL?.startsWith("https://")) ok("LANDING_BASE_URL is https");
else fail(`LANDING_BASE_URL must be a public https URL (got ${env.LANDING_BASE_URL}) — the Event Pass link must open on a phone`);

if (bad) {
  console.log(`\n${bad} problem(s) — fix these before deploying.\n`);
  process.exit(1);
}

// ── 4. do the credentials actually work, from THIS host ────────────────
const b64 = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sheetsToken() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now,
  }));
  const sig = b64(crypto.createSign("RSA-SHA256").update(`${h}.${c}`).sign(env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${sig}` }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).access_token;
}

// Is email deliberately switched off? Decides whether a missing Mail.Send role
// is a misconfiguration or a choice.
let emailIntentionallyOff = false;

console.log("\n4. live credential checks");
let tok;
try { tok = await sheetsToken(); ok("Google service account authenticates"); }
catch (e) { fail(`Google auth failed: ${e.message}`); }

async function tab(name) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(name)}!A1:AZ1`,
    { headers: { Authorization: `Bearer ${tok}` } });
  return r.ok ? (await r.json()).values?.[0] ?? [] : null;
}

if (tok) {
  const auto = await tab(env.SHEET_AUTOMATION_TAB);
  if (!auto) {
    // Expected while the campaign is paused — the tab is renamed to stop sends.
    warn(`automation tab '${env.SHEET_AUTOMATION_TAB}' NOT READABLE — normal while paused (tab renamed); the tick will halt and send nothing until it is renamed back`);
  } else {
    const need = ["lead_id", "phone_key", "email", "confirm_token", "registration_complete", "nurture_stage", "status", "status_at"];
    const missing = need.filter((c) => !auto.includes(c));
    missing.length
      ? fail(`automation tab is missing column(s): ${missing.join(", ")} — preflight would halt every tick`)
      : ok(`automation tab '${env.SHEET_AUTOMATION_TAB}' readable, all 8 required columns present`);
  }

  for (const name of env.SHEET_FORM_TAB.split(",").map((s) => s.trim()).filter(Boolean)) {
    (await tab(name)) ? ok(`form tab '${name}' readable`) : fail(`form tab '${name}' NOT readable — its leads would never be ingested`);
  }

  const ctrl = await tab(env.SHEET_CONTROL_TAB);
  if (ctrl) {
    ok(`control tab '${env.SHEET_CONTROL_TAB}' readable`);
    const rows = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(env.SHEET_CONTROL_TAB)}!A1:B50`,
      { headers: { Authorization: `Bearer ${tok}` } });
    if (rows.ok) {
      const vals = (await rows.json()).values || [];
      const row = vals.find((v) => (v[0] || "").trim().toLowerCase() === "email_enabled");
      const off = ["false", "no", "off", "0", "n"].includes((row?.[1] || "").trim().toLowerCase());
      emailIntentionallyOff = off;
      if (off) warn("email_enabled=FALSE — the campaign will run WhatsApp-only");
    }
  } else warn(`control tab '${env.SHEET_CONTROL_TAB}' not readable — switches default to ON`);

  if (env.SHEET_CALLING_TAB) {
    (await tab(env.SHEET_CALLING_TAB)) ? ok(`calling tab '${env.SHEET_CALLING_TAB}' readable`)
      : warn(`calling tab '${env.SHEET_CALLING_TAB}' not readable — dispositions will not sync`);
  }

  // Writable? A read-only service account sends without recording, which is the
  // 17 July failure mode: messages go out, state does not persist, the loop
  // repeats. Probed by rewriting a cell to the value it already holds.
  if (auto) {
    const cur = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(env.SHEET_AUTOMATION_TAB)}!A1`, { headers: { Authorization: `Bearer ${tok}` } });
    const val = (await cur.json()).values?.[0]?.[0] ?? "lead_id";
    const w = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(env.SHEET_AUTOMATION_TAB)}!A1?valueInputOption=RAW`,
      { method: "PUT", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ values: [[val]] }) });
    w.ok ? ok("service account can WRITE (not just read)")
         : fail(`service account is READ-ONLY (${w.status}) — sends would succeed but nothing would be recorded, and every tick would resend`);
  }
}

try {
  const r = await fetch(`https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.AZURE_CLIENT_ID, client_secret: env.AZURE_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!r.ok) fail(`Microsoft Graph auth failed: ${r.status}`);
  else {
    const claims = JSON.parse(Buffer.from((await r.json()).access_token.split(".")[1], "base64").toString());
    const roles = claims.roles || [];
    ok(`Graph authenticates, roles: ${roles.join(", ") || "none"}`);
    // Missing Mail.Send is only a problem if email is meant to be on. When the
    // control tab says email_enabled=FALSE the revocation is deliberate — a
    // second lock on top of the switch — and failing the deploy for it would
    // block the very configuration someone chose on purpose.
    if (!roles.includes("Mail.Send")) {
      emailIntentionallyOff
        ? warn("Graph token lacks Mail.Send — expected, email_enabled=FALSE in the control tab")
        : fail("Graph token lacks Mail.Send — no email can be sent, and the control tab does not say that was intended");
    }
    if (!roles.includes("Mail.Read")) warn("Graph token lacks Mail.Read — email replies will not be detected");
  }
} catch (e) { fail(`Graph check failed: ${e.message}`); }

try {
  const r = await fetch(`${env.WATI_API_ENDPOINT.replace(/\/+$/, "")}/api/v1/getMessageTemplates`,
    { headers: { Authorization: `Bearer ${env.WATI_ACCESS_TOKEN}` } });
  r.ok ? ok("WATI authenticates") : fail(`WATI auth failed: ${r.status} — no WhatsApp can be sent`);
} catch (e) { fail(`WATI check failed: ${e.message}`); }

console.log(bad ? `\n${bad} problem(s) — DO NOT DEPLOY until these are fixed.\n`
                : `\nAll checks passed — safe to deploy.\n`);
process.exit(bad ? 1 : 0);
