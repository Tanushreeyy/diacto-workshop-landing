// Per-ROUTE env check. check-env.mjs validates only SHEET_ID / SHEET_FORM_TAB —
// the pre-routing singletons. In multi-campaign mode the tick works through
// CAMPAIGN_ROUTES instead, so a route whose sheet is unshared or whose form tab
// is misspelled passes check-env and then fails live. This checks every route
// the way the tick will use it.
//
//   npx tsx scripts/check-routes.mts [envfile]      (default .env.production)
//
// Read-only apart from check-env's own idempotent A1 write-back, which proves
// the service account is not read-only without changing anything.
import { readFileSync } from "fs";

const FILE = process.argv[2] || ".env.production";
for (const line of readFileSync(FILE, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { allRoutes } = await import("../lib/booking/routes.js");
const { withCampaign } = await import("../lib/booking/campaignContext.js");
const { readTable } = await import("../lib/booking/google.js");
const { env } = await import("../lib/booking/env.js");
const { loadCampaign, campaignProblems, hasEnded } = await import("../lib/booking/campaign.js");

const NEED = ["lead_id","phone_key","email","confirm_token","registration_complete","nurture_stage","status","status_at"];
let bad = 0;
const ok   = (m: string) => console.log("  ok   ", m);
const fail = (m: string) => { bad++; console.log("  FAIL ", m); };

console.log(`env file: ${FILE}\n`);

const routes = allRoutes();
console.log(`CAMPAIGN_ROUTES parses — ${routes.length} route(s)`);
const dupKey  = routes.length !== new Set(routes.map((r: any) => r.key)).size;
const dupHost = routes.length !== new Set(routes.map((r: any) => r.host)).size;
if (dupKey)  fail("duplicate route key — a later route silently shadows an earlier one");
if (dupHost) fail("duplicate host — one campaign becomes unreachable");

// Every WATI template the deployment names, checked once against the live list.
const live = new Map<string, string>();
for (let attempt = 1; attempt <= 3 && !live.size; attempt++) {
  try {
    const r = await fetch(`${process.env.WATI_API_ENDPOINT}/api/v1/getMessageTemplates?pageSize=200`,
      { headers: { Authorization: `Bearer ${process.env.WATI_ACCESS_TOKEN}` } });
    if (!r.ok) { fail(`WATI template list unreadable (${r.status}) — cannot verify template names`); break; }
    for (const t of ((await r.json()) as any).messageTemplates ?? []) {
      live.set(t.elementName, String(t.status ?? "").toUpperCase());
    }
  } catch (e: any) {
    if (attempt === 3) fail(`WATI unreachable after 3 tries (${e.message}) — template names NOT verified`);
  }
}
if (live.size) console.log(`WATI reachable — ${live.size} live template(s)`);

const checkTpl = (label: string, name: string) => {
  if (!name) return;
  const st = live.get(name);
  if (!live.size) return;
  if (!st) fail(`${label}: template '${name}' DOES NOT EXIST in WATI — every send throws`);
  else if (st !== "APPROVED") fail(`${label}: template '${name}' is ${st}, not APPROVED`);
  else ok(`${label}: '${name}' approved`);
};

for (const route of routes) {
  console.log(`\n── ${route.key}  ${route.host}`);
  await withCampaign(route, async () => {
    let c: any;
    try { c = await loadCampaign(); }
    catch (e: any) { fail(`control tab unreadable: ${e.message}`); return; }
    ok(`control tab '${env.controlTab()}' readable · flow ${c.flow}`);

    const probs = campaignProblems(c);
    probs.length ? fail(`campaign problems: ${probs.join(" | ")}`) : ok("campaignProblems: none");
    // A finished workshop SHOULD report hasEnded — it is how the campaign stops
    // itself. Note it rather than failing, so the exit code stays meaningful for
    // the campaign actually being brought up.
    hasEnded(c)
      ? console.log("  note   hasEnded is TRUE — dormant, sends nothing (correct for a finished event)")
      : ok("hasEnded: false — this campaign is LIVE");

    for (const tab of route.formTab.split(",").map((s: string) => s.trim()).filter(Boolean)) {
      try { const t = await readTable(tab); ok(`form tab '${tab}' readable (${t.rows.length} rows)`); }
      catch { fail(`form tab '${tab}' NOT READABLE — leads are never ingested`); }
    }

    try {
      const a = await readTable(env.autoTab());
      const missing = NEED.filter((n) => !a.header.includes(n));
      missing.length
        ? fail(`automation tab '${env.autoTab()}' missing: ${missing.join(", ")} — preflight halts every tick`)
        : ok(`automation tab '${env.autoTab()}' readable (${a.rows.length} rows), all 8 columns present`);
    } catch { fail(`automation tab '${env.autoTab()}' NOT READABLE — tick halts`); }

    checkTpl("lead followup", c.templates.leadFollowup);
    checkTpl("lead alert", c.templates.leadAlert);
    for (const [k, v] of Object.entries(c.templates)) {
      if (k === "leadFollowup" || k === "leadAlert") continue;
      if (typeof v === "string") checkTpl(k, v);
    }
  });
}

console.log(bad ? `\n${bad} problem(s).` : "\nAll routes check out.");
process.exit(bad ? 1 : 0);
